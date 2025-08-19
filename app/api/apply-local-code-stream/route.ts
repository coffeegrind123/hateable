import { NextRequest, NextResponse } from 'next/server';
import { sandboxClient, type SandboxFile } from '@/lib/sandbox-client';

interface ParsedResponse {
  explanation: string;
  files: Array<{ path: string; content: string }>;
  packages: string[];
}

function parseAIResponse(response: string): ParsedResponse {
  const sections = {
    files: [] as Array<{ path: string; content: string }>,
    packages: [] as string[],
    explanation: ''
  };
  
  // Extract files
  const fileRegex = /<file path="([^"]+)">([\s\S]*?)<\/file>/g;
  let fileMatch;
  
  while ((fileMatch = fileRegex.exec(response)) !== null) {
    const filePath = fileMatch[1];
    const content = fileMatch[2].trim();
    sections.files.push({ path: filePath, content });
    
    // Extract packages from imports in this file
    const packages = extractPackagesFromCode(content);
    sections.packages.push(...packages);
  }
  
  // Extract explanation
  const explanationMatch = response.match(/<explanation>([\s\S]*?)<\/explanation>/);
  if (explanationMatch) {
    sections.explanation = explanationMatch[1].trim();
  }
  
  // Remove duplicates from packages
  sections.packages = [...new Set(sections.packages)];
  
  return sections;
}

function extractPackagesFromCode(content: string): string[] {
  const packages: string[] = [];
  const importRegex = /import\s+(?:(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)(?:\s*,\s*(?:\{[^}]*\}|\*\s+as\s+\w+|\w+))*\s+from\s+)?['"]([^'"]+)['"]/g;
  let importMatch;
  
  while ((importMatch = importRegex.exec(content)) !== null) {
    const importPath = importMatch[1];
    // Skip relative imports and built-in React
    if (!importPath.startsWith('.') && !importPath.startsWith('/') && 
        importPath !== 'react' && importPath !== 'react-dom' &&
        !importPath.startsWith('@/')) {
      const packageName = importPath.startsWith('@') 
        ? importPath.split('/').slice(0, 2).join('/')
        : importPath.split('/')[0];
      
      if (!packages.includes(packageName)) {
        packages.push(packageName);
      }
    }
  }
  
  return packages;
}

export async function POST(request: NextRequest) {
  const encoder = new TextEncoder();
  
  try {
    const { response: aiResponse, isEdit = false, packages: additionalPackages = [] } = await request.json();
    
    const sandboxId = global.sandboxData?.sandboxId;
    
    if (!sandboxId) {
      return NextResponse.json({ error: 'No active sandbox found' }, { status: 400 });
    }
    
    console.log('[apply-local-code-stream] Applying code to containerized sandbox');
    console.log('[apply-local-code-stream] Sandbox ID:', sandboxId);
    
    // Create a stream for real-time updates
    const stream = new TransformStream();
    const writer = stream.writable.getWriter();
    
    const sendProgress = async (data: any) => {
      const message = `data: ${JSON.stringify(data)}\n\n`;
      await writer.write(encoder.encode(message));
    };
    
    // Start processing in background
    (async () => {
      try {
        await sendProgress({ type: 'status', message: 'Parsing generated code...' });
        
        // Parse the AI response
        const parsed = parseAIResponse(aiResponse);
        
        console.log('[apply-local-code-stream] Parsed files:', parsed.files.map(f => f.path));
        console.log('[apply-local-code-stream] Detected packages:', parsed.packages);
        
        if (parsed.files.length === 0) {
          await sendProgress({ type: 'error', message: 'No files found in response' });
          return;
        }
        
        await sendProgress({ 
          type: 'status', 
          message: `Applying ${parsed.files.length} file(s)...` 
        });
        
        // Apply files using containerized sandbox service
        const sandboxFiles: SandboxFile[] = parsed.files.map(file => ({
          path: file.path,
          content: file.content
        }));
        
        await sendProgress({ 
          type: 'status', 
          message: 'Applying files to containerized sandbox...' 
        });
        
        const result = await sandboxClient.applyCode(sandboxId, sandboxFiles);
        
        if (!result.success) {
          // Check if this is a build error that can be auto-fixed
          if (result.error === 'BUILD_ERROR' && result.buildError) {
            console.log('[apply-local-code-stream] Build error detected, triggering auto-fix...');
            
            await sendProgress({
              type: 'status',
              message: 'Build error detected, attempting automatic fix...'
            });
            
            try {
              // Call auto-fix system with structured error data
              const autoFixResponse = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/auto-fix-errors`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  sandboxId: sandboxId,
                  error: {
                    type: 'build-error',
                    message: result.buildError.stderr || result.buildError.stdout || result.message,
                    command: result.buildError.command,
                    files: parsed.files.map(f => ({ path: f.path, content: f.content }))
                  }
                })
              });
              
              const autoFixResult = await autoFixResponse.json();
              if (autoFixResult.success) {
                await sendProgress({
                  type: 'status',
                  message: 'Auto-fix applied successfully, rebuilding...'
                });
                
                // Try applying code again after auto-fix
                const retryResult = await sandboxClient.applyCode(sandboxId, sandboxFiles);
                if (retryResult.success) {
                  await sendProgress({
                    type: 'status',
                    message: 'Build successful after auto-fix!'
                  });
                } else {
                  throw new Error(`Auto-fix failed: ${retryResult.message}`);
                }
              } else {
                throw new Error(`Auto-fix failed: ${autoFixResult.error}`);
              }
              
            } catch (autoFixError) {
              console.error('[apply-local-code-stream] Auto-fix failed:', autoFixError);
              await sendProgress({
                type: 'error',
                message: `Build failed and auto-fix unsuccessful: ${result.message}`
              });
              throw new Error(`Build failed: ${result.message}. Auto-fix attempted but failed: ${autoFixError.message}`);
            }
          } else {
            throw new Error(result.message || 'Failed to apply code to sandbox container');
          }
        }
        
        // Track applied files
        const appliedFiles: Record<string, string> = {};
        for (const file of parsed.files) {
          appliedFiles[file.path] = file.content;
          
          await sendProgress({
            type: 'file_applied',
            path: file.path,
            message: `Applied ${file.path}`
          });
          
          // Track file
          if (global.existingFiles) {
            global.existingFiles.add(file.path);
          }
        }
        
        // Update file cache
        if (global.sandboxState?.fileCache) {
          for (const [filePath, content] of Object.entries(appliedFiles)) {
            global.sandboxState.fileCache.files[filePath] = {
              content,
              lastModified: Date.now()
            };
          }
          global.sandboxState.fileCache.lastSync = Date.now();
        }
        
        // Enhanced package installation with streaming progress
        const allPackages = [...new Set([...parsed.packages, ...additionalPackages])].filter(Boolean);
        
        if (allPackages.length > 0) {
          await sendProgress({
            type: 'status',
            message: `Detected ${allPackages.length} package(s): ${allPackages.join(', ')}`
          });
          
          // Install packages with progress updates
          for (let i = 0; i < allPackages.length; i++) {
            const packageName = allPackages[i];
            await sendProgress({
              type: 'status',
              message: `▶ Installing ${packageName} (${i + 1}/${allPackages.length})...`
            });
            
            try {
              // For containerized sandbox, use the dedicated package installation endpoint
              const installResponse = await fetch(`${process.env.SANDBOX_SERVICE_URL}/api/sandbox/${sandboxId}/install-packages`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  packages: [packageName]
                })
              });
              
              if (installResponse.ok) {
                const result = await installResponse.json();
                if (result.success && result.packagesInstalled.includes(packageName)) {
                  await sendProgress({
                    type: 'package_installed',
                    package: packageName,
                    message: `✓ Successfully installed ${packageName}`
                  });
                } else {
                  await sendProgress({
                    type: 'package_error',
                    package: packageName,
                    message: `⚠ Package ${packageName} installation failed`
                  });
                }
              } else {
                await sendProgress({
                  type: 'package_error',
                  package: packageName,
                  message: `⚠ Package ${packageName} installation failed (${installResponse.status})`
                });
              }
            } catch (error) {
              await sendProgress({
                type: 'package_error',
                package: packageName,
                message: `⚠ Package ${packageName} installation error: ${error.message}`
              });
            }
          }
          
          await sendProgress({
            type: 'packages_complete',
            packages: allPackages,
            message: `Completed package detection for ${allPackages.length} package(s)`
          });
        }
        
        await sendProgress({
          type: 'status',
          message: 'Files applied and built successfully in container'
        });
        
        // Start build error monitoring for auto-fix
        try {
          await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/monitor-build-errors`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sandboxId, action: 'start' })
          });
          console.log('[apply-local-code-stream] Build error monitoring started');
        } catch (monitorError) {
          console.error('[apply-local-code-stream] Failed to start build monitoring:', monitorError);
        }

        await sendProgress({
          type: 'complete',
          files: parsed.files.map(f => f.path),
          packages: allPackages,
          explanation: parsed.explanation,
          message: 'Code applied successfully with auto-fix monitoring enabled'
        });
        
      } catch (error) {
        console.error('[apply-local-code-stream] Error:', error);
        await sendProgress({
          type: 'error',
          message: error instanceof Error ? error.message : 'Failed to apply code'
        });
      } finally {
        await writer.close();
      }
    })();
    
    // Return the stream
    return new Response(stream.readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
    
  } catch (error) {
    console.error('[apply-local-code-stream] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to apply code' },
      { status: 500 }
    );
  }
}
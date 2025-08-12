import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

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
    
    if (!global.activeSandbox) {
      return NextResponse.json({ error: 'No active sandbox' }, { status: 400 });
    }

    const sandboxPath = global.activeSandbox.sandboxPath;
    
    console.log('[apply-local-code-stream] Applying code to local sandbox');
    console.log('[apply-local-code-stream] Sandbox path:', sandboxPath);
    
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
        
        // Apply files to sandbox
        const appliedFiles: Record<string, string> = {};
        
        for (const file of parsed.files) {
          const fullPath = path.join(sandboxPath, file.path);
          const dirPath = path.dirname(fullPath);
          
          // Ensure directory exists
          await fs.mkdir(dirPath, { recursive: true });
          
          // Write file
          await fs.writeFile(fullPath, file.content);
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
        
        // Install packages if needed
        const allPackages = [...new Set([...parsed.packages, ...additionalPackages])].filter(Boolean);
        
        if (allPackages.length > 0) {
          await sendProgress({ 
            type: 'status', 
            message: `Installing ${allPackages.length} package(s): ${allPackages.join(', ')}` 
          });
          
          try {
            const installCommand = `npm install ${allPackages.join(' ')}`;
            const { stdout, stderr } = await execAsync(installCommand, {
              cwd: sandboxPath,
              timeout: 60000 // 1 minute timeout
            });
            
            if (stderr && !stderr.includes('npm WARN')) {
              console.warn('[apply-local-code-stream] npm install warnings:', stderr);
            }
            
            await sendProgress({
              type: 'packages_installed',
              packages: allPackages,
              message: 'Packages installed successfully'
            });
            
          } catch (installError: any) {
            console.error('[apply-local-code-stream] Package installation failed:', installError);
            await sendProgress({
              type: 'warning',
              message: `Package installation had issues: ${installError.message}`
            });
          }
        }
        
        await sendProgress({
          type: 'complete',
          files: parsed.files.map(f => f.path),
          packages: allPackages,
          explanation: parsed.explanation,
          message: 'Code applied successfully'
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
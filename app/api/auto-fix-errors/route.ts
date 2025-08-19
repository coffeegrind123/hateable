import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { sandboxClient } from '@/lib/sandbox-client';

// LLM-powered error fixing
async function fixErrorWithLLM(sandboxId: string, error: any, customEndpoint?: any): Promise<NextResponse> {
  try {
    console.log('[auto-fix-errors] Using LLM to fix error:', error);
    
    const sandboxPath = path.join(process.cwd(), 'sandboxes', sandboxId);
    
    // Read the problematic file
    const fileName = error.fromFile || error.file;
    if (!fileName) {
      throw new Error('No file specified in error');
    }
    
    const filePath = path.join(sandboxPath, fileName);
    const fileContent = await fs.readFile(filePath, 'utf8');
    
    // Create LLM prompt to fix the error
    const fixPrompt = `Fix this React/JavaScript error automatically:

ERROR: ${error.message}
FILE: ${fileName}
ERROR TYPE: ${error.type}

CURRENT FILE CONTENT:
${fileContent}

INSTRUCTIONS:
1. Analyze the error and fix it
2. If it's a missing import/component, create the missing file
3. If it's a syntax error, fix the syntax
4. Return the corrected code or create missing files
5. Ensure all imports are satisfied

Return your response in this format:
<fix>
<action>create|modify</action>
<file>path/to/file.jsx</file>
<content>
// Fixed code here
</content>
</fix>

If multiple files need to be created/modified, use multiple <fix> blocks.`;

    // Use configured endpoint or fallback
    const apiUrl = customEndpoint?.url || 'http://host.docker.internal:8081/v1';
    const apiKey = customEndpoint?.apiKey || '';
    const model = customEndpoint?.model || 'qwen3-coder-plus';
    
    // Call LLM API
    const response = await fetch(`${apiUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages: [{
          role: 'user',
          content: fixPrompt
        }],
        temperature: 0.1,
        max_tokens: 4000
      })
    });
    
    if (!response.ok) {
      throw new Error(`LLM API failed: ${response.status}`);
    }
    
    const data = await response.json();
    const llmResponse = data.choices[0]?.message?.content;
    
    if (!llmResponse) {
      throw new Error('No response from LLM');
    }
    
    console.log('[auto-fix-errors] LLM response:', llmResponse);
    
    // Parse LLM response and apply fixes
    const fixes = parseLLMFixes(llmResponse);
    const appliedFixes = [];
    
    for (const fix of fixes) {
      const targetPath = path.join(sandboxPath, fix.file);
      
      // Create directory if needed
      await fs.mkdir(path.dirname(targetPath), { recursive: true });
      
      // Apply the fix
      if (fix.action === 'create' || fix.action === 'modify') {
        await fs.writeFile(targetPath, fix.content, 'utf8');
        appliedFixes.push(fix.file);
        console.log(`[auto-fix-errors] ${fix.action === 'create' ? 'Created' : 'Modified'} file: ${fix.file}`);
      }
    }
    
    return NextResponse.json({
      success: true,
      action: 'llm_fix',
      appliedFixes,
      message: `LLM fixed error by ${appliedFixes.length > 1 ? 'updating multiple files' : 'updating ' + appliedFixes[0]}`
    });
    
  } catch (error) {
    console.error('[auto-fix-errors] LLM fix failed:', error);
    return NextResponse.json({
      success: false,
      error: `LLM fix failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    }, { status: 500 });
  }
}

// Parse LLM response to extract fixes
function parseLLMFixes(response: string): Array<{ action: string; file: string; content: string }> {
  const fixes = [];
  const fixRegex = /<fix>([\s\S]*?)<\/fix>/g;
  
  let match;
  while ((match = fixRegex.exec(response)) !== null) {
    const fixContent = match[1];
    
    const actionMatch = fixContent.match(/<action>(.*?)<\/action>/);
    const fileMatch = fixContent.match(/<file>(.*?)<\/file>/);
    const contentMatch = fixContent.match(/<content>([\s\S]*?)<\/content>/);
    
    if (actionMatch && fileMatch && contentMatch) {
      fixes.push({
        action: actionMatch[1].trim(),
        file: fileMatch[1].trim(),
        content: contentMatch[1].trim()
      });
    }
  }
  
  return fixes;
}

interface ViteError {
  message: string;
  file?: string;
  line?: number;
  column?: number;
  stack?: string;
}

// Enhanced dependency installation for auto-fix (containerized only)
async function fixMissingDependency(sandboxId: string, packageName: string, fromFile?: string): Promise<NextResponse> {
  try {
    console.log('[auto-fix-errors] Installing missing dependency:', packageName);
    
    // All sandboxes are containerized - use the sandbox service package installation
    const sandboxServiceUrl = process.env.SANDBOX_SERVICE_URL || 'http://sandbox-service:3004';
    const installResponse = await fetch(`${sandboxServiceUrl}/api/sandbox/${sandboxId}/install-packages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        packages: [packageName]
      })
    });
    
    if (!installResponse.ok) {
      throw new Error(`Container service responded with ${installResponse.status}`);
    }
    
    const result = await installResponse.json();
    
    if (result.success && result.packagesInstalled.includes(packageName)) {
      console.log(`[auto-fix-errors] Successfully installed dependency in container: ${packageName}`);
      return NextResponse.json({
        success: true,
        action: 'dependency_installed',
        packageName,
        message: `Successfully installed dependency: ${packageName}`
      });
    } else {
      throw new Error(`Package installation failed: ${result.error || 'Unknown error'}`);
    }
    
  } catch (error) {
    console.error('[auto-fix-errors] Error installing dependency:', error);
    return NextResponse.json({
      success: false,
      error: `Failed to install dependency ${packageName}: ${error instanceof Error ? error.message : 'Unknown error'}`
    }, { status: 500 });
  }
}

// Extract package name from import path
function extractPackageName(importPath: string): string {
  // Remove quotes and extract package name
  const cleanPath = importPath.replace(/['"]/g, '');
  
  // Handle scoped packages like @scope/package
  if (cleanPath.startsWith('@')) {
    const parts = cleanPath.split('/');
    return parts.slice(0, 2).join('/'); // @scope/package
  }
  
  // Handle regular packages
  return cleanPath.split('/')[0];
}

export async function POST(request: NextRequest) {
  try {
    const { sandboxId, error, customEndpoint } = await request.json();
    
    if (!sandboxId || !error) {
      return NextResponse.json({
        success: false,
        error: 'sandboxId and error are required'
      }, { status: 400 });
    }

    console.log('[auto-fix-errors] Attempting to auto-fix error:', error);
    
    const errorMessage = error.message || error.toString();
    const errorType = error.type || 'unknown';
    
    // Handle different error types
    switch (errorType) {
      case 'missing-import':
        return await fixMissingComponent(sandboxId, error.importPath, error.fromFile);
        
      case 'missing-dependency':
        return await fixMissingDependency(sandboxId, error.packageName, error.fromFile);
        
      case 'syntax-error':
        return await fixSyntaxError(sandboxId, error);
        
      default:
        // Try to auto-detect error type from message
        const missingImportMatch = errorMessage.match(/Failed to resolve import "([^"]+)" from "([^"]+)"/);
        if (missingImportMatch) {
          const [, importPath, fromFile] = missingImportMatch;
          
          // Determine if this is a local component import or external dependency
          if (importPath.startsWith('./') || importPath.startsWith('../')) {
            return await fixMissingComponent(sandboxId, importPath, fromFile);
          } else {
            // This is likely an external dependency
            const packageName = extractPackageName(importPath);
            console.log('[auto-fix-errors] Detected missing dependency:', packageName);
            return await fixMissingDependency(sandboxId, packageName, fromFile);
          }
        }
        
        // Check for Rollup "Could not resolve" errors (common in Vite builds)
        const rollupImportMatch = errorMessage.match(/Could not resolve "([^"]+)" from "([^"]+)"/);
        if (rollupImportMatch) {
          const [, importPath, fromFile] = rollupImportMatch;
          console.log('[auto-fix-errors] Detected Rollup import error:', { importPath, fromFile });
          
          // Determine if this is a local component import or external dependency
          if (importPath.startsWith('./') || importPath.startsWith('../')) {
            return await fixMissingComponent(sandboxId, importPath, fromFile);
          } else {
            // This is likely an external dependency
            const packageName = extractPackageName(importPath);
            console.log('[auto-fix-errors] Detected missing dependency from Rollup:', packageName);
            return await fixMissingDependency(sandboxId, packageName, fromFile);
          }
        }
        
        // Check for other dependency-related error patterns
        const dependencyErrorPatterns = [
          /Cannot resolve module ['"]([^'"]+)['"]/,
          /Module not found: Error: Can't resolve ['"]([^'"]+)['"]/,
          /Could not resolve ['"]([^'"]+)['"]/,
          /Cannot find module ['"]([^'"]+)['"]/
        ];
        
        for (const pattern of dependencyErrorPatterns) {
          const match = errorMessage.match(pattern);
          if (match) {
            const packagePath = match[1];
            // Skip relative imports
            if (!packagePath.startsWith('./') && !packagePath.startsWith('../')) {
              const packageName = extractPackageName(packagePath);
              console.log('[auto-fix-errors] Detected missing dependency from pattern:', packageName);
              return await fixMissingDependency(sandboxId, packageName);
            }
          }
        }
        
        // If we can't handle it with simple rules, use LLM
        console.log('[auto-fix-errors] Using LLM as fallback for complex error');
        return await fixErrorWithLLM(sandboxId, error, customEndpoint);
        break;
    }
    
    // Check for other common errors
    const syntaxErrorMatch = errorMessage.match(/SyntaxError|Unexpected token/);
    if (syntaxErrorMatch) {
      return await fixSyntaxError(sandboxId, error);
    }
    
    // Check for missing CSS/asset imports
    const missingAssetMatch = errorMessage.match(/Cannot resolve module '([^']+\.css)'/);
    if (missingAssetMatch) {
      return await fixMissingAsset(sandboxId, missingAssetMatch[1]);
    }
    
    // Final fallback: Use LLM for any unhandled error
    console.log('[auto-fix-errors] Using LLM for unknown error type');
    return await fixErrorWithLLM(sandboxId, error, customEndpoint);
    
  } catch (error) {
    console.error('[auto-fix-errors] Error:', error);
    return NextResponse.json({
      success: false,
      error: (error as Error).message
    }, { status: 500 });
  }
}

async function fixMissingComponent(sandboxId: string, importPath: string, fromFile: string) {
  try {
    console.log('[auto-fix-errors] Creating missing component:', importPath, 'for sandbox:', sandboxId);
    
    // Extract component name from import path
    const componentName = path.basename(importPath, '.jsx') || path.basename(importPath, '.js');
    
    // All sandboxes are now containerized - use sandbox service directly
    return await fixMissingComponentContainerized(sandboxId, importPath, fromFile, componentName);
    
  } catch (error) {
    console.error('[auto-fix-errors] Error creating component:', error);
    return NextResponse.json({
      success: false,
      error: `Failed to create component: ${(error as Error).message}`
    }, { status: 500 });
  }
}

async function fixSyntaxError(sandboxId: string, error: ViteError) {
  try {
    if (!error.file) {
      return NextResponse.json({
        success: false,
        error: 'Cannot fix syntax error without file information'
      });
    }
    
    const sandboxPath = path.join(process.cwd(), 'sandboxes', sandboxId);
    const filePath = path.join(sandboxPath, error.file);
    
    // Read the file
    const content = await fs.readFile(filePath, 'utf8');
    
    // Common syntax fixes
    let fixedContent = content;
    
    // Fix common JSX syntax errors
    fixedContent = fixedContent.replace(/class=/g, 'className=');
    fixedContent = fixedContent.replace(/for=/g, 'htmlFor=');
    
    // Fix missing semicolons (basic)
    fixedContent = fixedContent.replace(/\n(\s*)(import .* from [^;]+)\n/g, '\n$1$2;\n');
    fixedContent = fixedContent.replace(/\n(\s*)(export .* from [^;]+)\n/g, '\n$1$2;\n');
    
    if (fixedContent !== content) {
      await fs.writeFile(filePath, fixedContent, 'utf8');
      
      return NextResponse.json({
        success: true,
        action: 'fixed_syntax',
        filePath: error.file,
        message: 'Fixed common syntax errors'
      });
    }
    
    return NextResponse.json({
      success: false,
      error: 'Could not automatically fix this syntax error'
    });
    
  } catch (error) {
    console.error('[auto-fix-errors] Error fixing syntax:', error);
    return NextResponse.json({
      success: false,
      error: `Failed to fix syntax error: ${(error as Error).message}`
    }, { status: 500 });
  }
}

async function fixMissingAsset(sandboxId: string, assetPath: string) {
  try {
    const sandboxPath = path.join(process.cwd(), 'sandboxes', sandboxId);
    const fullAssetPath = path.join(sandboxPath, 'src', assetPath);
    
    // Create directory if it doesn't exist
    await fs.mkdir(path.dirname(fullAssetPath), { recursive: true });
    
    // Create a basic CSS file if it's missing
    if (assetPath.endsWith('.css')) {
      const basicCSS = `/* Auto-generated CSS file */
@tailwind base;
@tailwind components;
@tailwind utilities;

/* Add your custom styles here */
`;
      await fs.writeFile(fullAssetPath, basicCSS, 'utf8');
      
      return NextResponse.json({
        success: true,
        action: 'created_asset',
        assetPath: fullAssetPath,
        message: `Created missing CSS file: ${assetPath}`
      });
    }
    
    return NextResponse.json({
      success: false,
      error: 'Unknown asset type - cannot auto-create'
    });
    
  } catch (error) {
    console.error('[auto-fix-errors] Error creating asset:', error);
    return NextResponse.json({
      success: false,
      error: `Failed to create asset: ${(error as Error).message}`
    }, { status: 500 });
  }
}

// Helper function to generate component code
function generateComponentCode(componentName: string): string {
  return `import React from 'react';

const ${componentName} = () => {
  return (
    <div className="p-6 bg-white border-4 border-black shadow-[8px_8px_0px_0px_#000]">
      <h2 className="text-2xl font-bold mb-4 border-b-4 border-black pb-2">${componentName}</h2>
      <p className="text-gray-700">
        This component was automatically generated to fix a missing import error.
        Please customize it according to your needs.
      </p>
      <div className="mt-4 p-3 bg-yellow-300 border-2 border-black">
        <p className="text-sm font-bold">Auto-generated component</p>
        <p className="text-xs">Replace this content with your implementation</p>
      </div>
    </div>
  );
};

export default ${componentName};
`;
}

// Helper function to fix missing component in containerized sandbox
async function fixMissingComponentContainerized(
  sandboxId: string, 
  importPath: string, 
  fromFile: string, 
  componentName: string
): Promise<NextResponse> {
  try {
    // Calculate the target file path relative to the sandbox root
    // fromFile is like "src/App.jsx", importPath is like "./components/MainContent"
    const fromDir = path.dirname(fromFile);
    
    // Use path.join instead of path.resolve to keep it relative
    let targetPath = path.join(fromDir, importPath).replace(/\\/g, '/');
    
    // Add .jsx extension if not present
    const componentFilePath = targetPath.endsWith('.jsx') || targetPath.endsWith('.js') 
      ? targetPath 
      : `${targetPath}.jsx`;
    
    // Ensure path is normalized and relative
    const normalizedPath = componentFilePath.replace(/^\.\//, '').replace(/\\/g, '/');
    
    console.log('[auto-fix-errors] Calculated component path:', normalizedPath);
    
    const componentCode = generateComponentCode(componentName);
    
    // Use the sandbox service apply-code endpoint to create the file
    const sandboxServiceUrl = process.env.SANDBOX_SERVICE_URL || 'http://sandbox-service:3004';
    const response = await fetch(`${sandboxServiceUrl}/api/sandbox/${sandboxId}/apply-code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        files: [{
          path: normalizedPath,
          content: componentCode
        }]
      })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Sandbox service responded with ${response.status}: ${errorText}`);
    }
    
    const result = await response.json();
    
    if (result.success) {
      console.log(`[auto-fix-errors] Successfully created component in container: ${normalizedPath}`);
      return NextResponse.json({
        success: true,
        action: 'created_component',
        componentPath: normalizedPath,
        componentName,
        message: `Created missing component: ${componentName}`
      });
    } else {
      throw new Error(`Sandbox service failed: ${result.error || 'Unknown error'}`);
    }
    
  } catch (error) {
    console.error('[auto-fix-errors] Error creating component in container:', error);
    return NextResponse.json({
      success: false,
      error: `Failed to create component in container: ${error.message}`
    }, { status: 500 });
  }
}
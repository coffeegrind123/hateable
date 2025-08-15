import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

interface ViteError {
  message: string;
  file?: string;
  line?: number;
  column?: number;
  stack?: string;
}

export async function POST(request: NextRequest) {
  try {
    const { sandboxId, error } = await request.json();
    
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
        
      case 'syntax-error':
        return await fixSyntaxError(sandboxId, error);
        
      default:
        // Try to auto-detect error type from message
        const missingImportMatch = errorMessage.match(/Failed to resolve import "([^"]+)" from "([^"]+)"/);
        if (missingImportMatch) {
          const [, importPath, fromFile] = missingImportMatch;
          
          // Determine if this is a local component import
          if (importPath.startsWith('./') || importPath.startsWith('../')) {
            return await fixMissingComponent(sandboxId, importPath, fromFile);
          }
        }
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
    
    return NextResponse.json({
      success: false,
      error: 'Unknown error type - cannot auto-fix',
      errorType: 'unknown'
    });
    
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
    const sandboxPath = path.join(process.cwd(), 'sandboxes', sandboxId);
    
    // Extract component name from import path
    const componentName = path.basename(importPath, '.jsx') || path.basename(importPath, '.js');
    
    // Determine the full file path
    const componentPath = path.resolve(path.dirname(path.join(sandboxPath, fromFile)), importPath);
    const componentFile = componentPath.endsWith('.jsx') || componentPath.endsWith('.js') 
      ? componentPath 
      : `${componentPath}.jsx`;
    
    // Create the component directory if it doesn't exist
    const componentDir = path.dirname(componentFile);
    await fs.mkdir(componentDir, { recursive: true });
    
    // Generate a basic component
    const componentCode = `import React from 'react';

const ${componentName} = () => {
  return (
    <div className="p-6 bg-gray-800 text-gray-100">
      <h2 className="text-2xl font-bold mb-4">${componentName}</h2>
      <p className="text-gray-300">
        This component was automatically generated to fix a missing import error.
        Please customize it according to your needs.
      </p>
    </div>
  );
};

export default ${componentName};
`;

    await fs.writeFile(componentFile, componentCode, 'utf8');
    
    console.log('[auto-fix-errors] Created missing component:', componentFile);
    
    return NextResponse.json({
      success: true,
      action: 'created_component',
      componentPath: componentFile,
      componentName,
      message: `Created missing component: ${componentName}`
    });
    
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
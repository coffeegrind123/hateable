import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

async function getFilesRecursively(dirPath: string, basePath: string): Promise<Record<string, string>> {
  const files: Record<string, string> = {};
  
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      const relativePath = path.relative(basePath, fullPath);
      
      // Skip node_modules, .git, and other build artifacts
      if (entry.name === 'node_modules' || 
          entry.name === '.git' || 
          entry.name === 'dist' || 
          entry.name === 'build' ||
          entry.name.startsWith('.')) {
        continue;
      }
      
      if (entry.isDirectory()) {
        const subFiles = await getFilesRecursively(fullPath, basePath);
        Object.assign(files, subFiles);
      } else if (entry.isFile()) {
        // Only include common text files
        const ext = path.extname(entry.name).toLowerCase();
        if (['.js', '.jsx', '.ts', '.tsx', '.json', '.css', '.html', '.md', '.txt'].includes(ext)) {
          try {
            const content = await fs.readFile(fullPath, 'utf-8');
            files[relativePath.replace(/\\/g, '/')] = content;
          } catch (readError) {
            console.warn(`Could not read file ${relativePath}:`, readError);
          }
        }
      }
    }
  } catch (error) {
    console.error(`Error reading directory ${dirPath}:`, error);
  }
  
  return files;
}

function generateFileManifest(files: Record<string, string>) {
  const manifest: any = {
    files: {},
    structure: {},
    lastSync: Date.now()
  };
  
  for (const [filePath, content] of Object.entries(files)) {
    manifest.files[filePath] = {
      size: content.length,
      lastModified: Date.now(),
      type: path.extname(filePath) || 'file',
      componentInfo: filePath.endsWith('.jsx') || filePath.endsWith('.tsx') ? {
        name: path.basename(filePath, path.extname(filePath)),
        isComponent: true
      } : undefined
    };
  }
  
  return manifest;
}

export async function GET() {
  try {
    if (!global.activeSandbox) {
      return NextResponse.json({ error: 'No active sandbox' }, { status: 400 });
    }

    const sandboxPath = global.activeSandbox.sandboxPath;
    
    console.log('[get-local-sandbox-files] Reading files from:', sandboxPath);

    // Get all files recursively
    const files = await getFilesRecursively(sandboxPath, sandboxPath);
    const manifest = generateFileManifest(files);
    
    // Update cache
    if (global.sandboxState?.fileCache) {
      global.sandboxState.fileCache.files = {};
      for (const [filePath, content] of Object.entries(files)) {
        global.sandboxState.fileCache.files[filePath] = {
          content,
          lastModified: Date.now()
        };
      }
      global.sandboxState.fileCache.manifest = manifest;
      global.sandboxState.fileCache.lastSync = Date.now();
    }
    
    console.log('[get-local-sandbox-files] Retrieved', Object.keys(files).length, 'files');

    return NextResponse.json({
      success: true,
      files,
      manifest,
      sandboxId: global.activeSandbox.sandboxId
    });

  } catch (error) {
    console.error('[get-local-sandbox-files] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to get sandbox files' },
      { status: 500 }
    );
  }
}
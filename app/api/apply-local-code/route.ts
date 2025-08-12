import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

export async function POST(request: NextRequest) {
  try {
    const { files } = await request.json();
    
    if (!global.activeSandbox) {
      return NextResponse.json({ error: 'No active sandbox' }, { status: 400 });
    }

    const sandboxPath = global.activeSandbox.sandboxPath;
    
    console.log('[apply-local-code] Applying code to local sandbox:', sandboxPath);
    console.log('[apply-local-code] Files to apply:', Object.keys(files));

    // Apply each file
    for (const [filePath, content] of Object.entries(files)) {
      const fullPath = path.join(sandboxPath, filePath);
      const dirPath = path.dirname(fullPath);
      
      // Ensure directory exists
      await fs.mkdir(dirPath, { recursive: true });
      
      // Write file
      await fs.writeFile(fullPath, content as string);
      console.log('[apply-local-code] Applied file:', filePath);
      
      // Track file
      if (global.existingFiles) {
        global.existingFiles.add(filePath);
      }
    }

    // Update file cache in sandbox state
    if (global.sandboxState?.fileCache) {
      for (const [filePath, content] of Object.entries(files)) {
        global.sandboxState.fileCache.files[filePath] = {
          content: content as string,
          lastModified: Date.now()
        };
      }
      global.sandboxState.fileCache.lastSync = Date.now();
    }

    console.log('[apply-local-code] Code applied successfully');

    return NextResponse.json({
      success: true,
      message: 'Code applied to local sandbox',
      filesApplied: Object.keys(files)
    });

  } catch (error) {
    console.error('[apply-local-code] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to apply code' },
      { status: 500 }
    );
  }
}
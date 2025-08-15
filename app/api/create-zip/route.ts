import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

declare global {
  var activeSandbox: any;
}

export async function POST(request: NextRequest) {
  try {
    if (!global.activeSandbox?.sandboxPath) {
      return NextResponse.json({ 
        success: false, 
        error: 'No active sandbox' 
      }, { status: 400 });
    }
    
    console.log('[create-zip] Creating project zip...');
    
    const sandboxPath = global.activeSandbox.sandboxPath;
    const sandboxId = global.activeSandbox.sandboxId || 'lovable-project';
    const zipPath = path.join('/tmp', `${sandboxId}.zip`);
    
    // Use system zip command to create the archive
    // Exclude node_modules, .git, .next, dist, and other build artifacts
    const zipCommand = `cd "${sandboxPath}" && zip -r "${zipPath}" . -x "node_modules/*" ".git/*" ".next/*" "dist/*" ".cache/*" "*.log"`;
    
    console.log('[create-zip] Running zip command:', zipCommand);
    
    await execAsync(zipCommand, { timeout: 30000 });
    
    // Read the zip file
    const zipBuffer = await fs.readFile(zipPath);
    
    // Convert to base64
    const base64Content = zipBuffer.toString('base64');
    
    // Create a data URL for download
    const dataUrl = `data:application/zip;base64,${base64Content}`;
    
    // Clean up the temporary zip file
    try {
      await fs.unlink(zipPath);
    } catch (cleanupError) {
      console.warn('[create-zip] Failed to cleanup temp file:', cleanupError);
    }
    
    console.log(`[create-zip] Created zip file (${zipBuffer.length} bytes)`);
    
    return NextResponse.json({
      success: true,
      dataUrl,
      fileName: `${sandboxId}.zip`,
      message: 'Zip file created successfully'
    });
    
  } catch (error) {
    console.error('[create-zip] Error:', error);
    return NextResponse.json({ 
      success: false, 
      error: (error as Error).message 
    }, { status: 500 });
  }
}
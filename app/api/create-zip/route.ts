import { NextRequest, NextResponse } from 'next/server';
import { sandboxClient } from '@/lib/sandbox-client';

declare global {
  var activeSandbox: any;
}

export async function POST(request: NextRequest) {
  try {
    if (!global.activeSandbox) {
      return NextResponse.json({ 
        success: false, 
        error: 'No active sandbox' 
      }, { status: 400 });
    }
    
    const sandboxId = global.activeSandbox.sandboxId || 'lovable-project';
    
    console.log('[create-zip] Creating project zip for sandbox:', sandboxId);
    
    // For containerized sandboxes, use the sandbox client
    if (global.activeSandbox.containerized) {
      try {
        const result = await sandboxClient.createZip(sandboxId);
        
        // Create a data URL for download
        const dataUrl = `data:application/zip;base64,${result.content}`;
        
        return NextResponse.json({
          success: result.success,
          dataUrl,
          fileName: result.filename,
          message: 'Zip file created successfully'
        });
        
      } catch (error: any) {
        console.error('[create-zip] Error creating zip via sandbox client:', error);
        return NextResponse.json({ 
          success: false, 
          error: `Failed to create zip: ${error.message}`
        }, { status: 500 });
      }
    } else {
      // Legacy path - should not be used anymore since we exclusively use containerized sandboxes
      console.warn('[create-zip] Legacy non-containerized sandbox detected - this should not happen');
      return NextResponse.json({
        success: false,
        error: 'Non-containerized sandboxes are no longer supported'
      }, { status: 400 });
    }
    
  } catch (error) {
    console.error('[create-zip] Error:', error);
    return NextResponse.json({ 
      success: false, 
      error: (error as Error).message 
    }, { status: 500 });
  }
}
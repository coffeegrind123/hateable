import { NextResponse } from 'next/server';
import { sandboxClient } from '@/lib/sandbox-client';

export async function GET() {
  try {
    if (!global.activeSandbox) {
      return NextResponse.json({ error: 'No active sandbox' }, { status: 400 });
    }

    const sandboxId = global.activeSandbox.sandboxId;
    
    console.log('[get-local-sandbox-files] Getting files for sandbox:', sandboxId);

    // For containerized sandboxes, use the sandbox client
    if (global.activeSandbox.containerized) {
      try {
        const result = await sandboxClient.getFiles(sandboxId);
        
        // Update cache
        if (global.sandboxState?.fileCache) {
          global.sandboxState.fileCache.files = {};
          for (const [filePath, content] of Object.entries(result.files)) {
            global.sandboxState.fileCache.files[filePath] = {
              content,
              lastModified: Date.now()
            };
          }
          global.sandboxState.fileCache.manifest = result.manifest;
          global.sandboxState.fileCache.lastSync = Date.now();
        }
        
        console.log('[get-local-sandbox-files] Retrieved', Object.keys(result.files).length, 'files via sandbox client');

        return NextResponse.json({
          success: true,
          files: result.files,
          manifest: result.manifest,
          sandboxId: sandboxId
        });
        
      } catch (error) {
        console.error('[get-local-sandbox-files] Error calling sandbox client:', error);
        return NextResponse.json(
          { error: error instanceof Error ? error.message : 'Failed to get sandbox files' },
          { status: 500 }
        );
      }
    } else {
      // Legacy path - should not be used anymore since we exclusively use containerized sandboxes
      console.warn('[get-local-sandbox-files] Legacy non-containerized sandbox detected - this should not happen');
      return NextResponse.json(
        { error: 'Non-containerized sandboxes are no longer supported' },
        { status: 400 }
      );
    }

  } catch (error) {
    console.error('[get-local-sandbox-files] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to get sandbox files' },
      { status: 500 }
    );
  }
}
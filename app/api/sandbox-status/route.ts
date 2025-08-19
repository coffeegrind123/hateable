import { NextResponse } from 'next/server';

declare global {
  var activeSandbox: any;
  var sandboxData: any;
  var existingFiles: Set<string>;
}

export async function GET() {
  try {
    // Check if sandbox exists
    const sandboxExists = !!global.activeSandbox;
    
    let sandboxHealthy = false;
    let sandboxInfo = null;
    
    if (sandboxExists && global.activeSandbox) {
      try {
        // For containerized sandboxes, check if the sandbox service is responding
        if (global.activeSandbox.containerized) {
          try {
            // Check if sandbox service is responding by making a simple request
            const sandboxUrl = global.sandboxData?.url;
            if (sandboxUrl) {
              // Try to reach the sandbox service health endpoint
              const healthResponse = await fetch(`http://host.docker.internal:3004/health`, {
                method: 'GET',
                signal: AbortSignal.timeout(2000) // 2 second timeout
              });
              sandboxHealthy = healthResponse.ok;
            } else {
              sandboxHealthy = false;
            }
          } catch (error) {
            console.log('[sandbox-status] Sandbox service health check failed:', error.message);
            sandboxHealthy = false;
          }
        } else {
          // For legacy sandboxes, just check if sandbox object exists
          sandboxHealthy = true;
        }
        
        sandboxInfo = {
          sandboxId: global.sandboxData?.sandboxId,
          url: global.sandboxData?.url,
          filesTracked: global.existingFiles ? Array.from(global.existingFiles) : [],
          containerized: global.activeSandbox.containerized || false,
          lastHealthCheck: new Date().toISOString()
        };
      } catch (error) {
        console.error('[sandbox-status] Health check failed:', error);
        sandboxHealthy = false;
      }
    }
    
    return NextResponse.json({
      success: true,
      active: sandboxExists,
      healthy: sandboxHealthy,
      sandboxData: sandboxInfo,
      message: sandboxHealthy 
        ? 'Sandbox is active and healthy' 
        : sandboxExists 
          ? 'Sandbox exists but is not responding' 
          : 'No active sandbox'
    });
    
  } catch (error) {
    console.error('[sandbox-status] Error:', error);
    return NextResponse.json({ 
      success: false,
      active: false,
      error: (error as Error).message 
    }, { status: 500 });
  }
}
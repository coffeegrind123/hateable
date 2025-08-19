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
        // For containerized sandboxes, check if the directory exists and has content
        if (global.activeSandbox.containerized) {
          const fs = require('fs');
          const path = require('path');
          
          const sandboxPath = global.activeSandbox.sandboxPath;
          const packageJsonPath = path.join(sandboxPath, 'package.json');
          
          // Check if sandbox directory and core files exist
          sandboxHealthy = fs.existsSync(sandboxPath) && fs.existsSync(packageJsonPath);
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
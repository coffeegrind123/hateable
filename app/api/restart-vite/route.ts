import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import { appConfig } from '@/config/app.config';

declare global {
  var activeSandbox: any;
}

export async function POST() {
  try {
    if (!global.activeSandbox) {
      return NextResponse.json({ 
        success: false, 
        error: 'No active sandbox' 
      }, { status: 400 });
    }
    
    console.log('[restart-vite] Restarting local Vite process...');
    
    const sandboxPath = global.activeSandbox.sandboxPath;
    
    // Kill existing Vite process
    if (global.activeSandbox.viteProcess) {
      try {
        global.activeSandbox.viteProcess.kill('SIGTERM');
        console.log('[restart-vite] Killed existing Vite process');
      } catch (error) {
        console.warn('[restart-vite] Error killing existing process:', error);
      }
    }
    
    // Wait a moment for cleanup
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Start new Vite process
    const viteProcess = spawn('npm', ['run', 'dev'], {
      cwd: sandboxPath,
      stdio: ['inherit', 'pipe', 'pipe'],
      env: { ...process.env, FORCE_COLOR: '0' }
    });
    
    // Update the global reference
    global.activeSandbox.viteProcess = viteProcess;
    
    // Set up logging
    viteProcess.stdout?.on('data', (data) => {
      console.log('[vite restart]', data.toString());
    });
    
    viteProcess.stderr?.on('data', (data) => {
      console.error('[vite restart error]', data.toString());
    });
    
    // Wait for Vite to start
    await new Promise(resolve => setTimeout(resolve, appConfig.sandbox.viteStartupDelay));
    
    console.log('[restart-vite] Vite restarted successfully');
    
    return NextResponse.json({
      success: true,
      message: 'Vite restarted successfully'
    });
    
  } catch (error) {
    console.error('[restart-vite] Error:', error);
    return NextResponse.json({ 
      success: false, 
      error: (error as Error).message 
    }, { status: 500 });
  }
}
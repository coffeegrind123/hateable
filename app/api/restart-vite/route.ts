import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import { appConfig } from '@/config/app.config';

declare global {
  var activeSandbox: any;
}

export async function POST() {
  try {
    // All sandboxes are now containerized - Vite restart is handled by the sandbox service
    console.log('[restart-vite] Containerized sandboxes do not require manual Vite restart');
    
    return NextResponse.json({
      success: true,
      message: 'Containerized sandboxes handle Vite automatically'
    });
    
  } catch (error) {
    console.error('[restart-vite] Error:', error);
    return NextResponse.json({ 
      success: false, 
      error: (error as Error).message 
    }, { status: 500 });
  }
}
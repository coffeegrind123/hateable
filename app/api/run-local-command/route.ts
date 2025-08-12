import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function POST(request: NextRequest) {
  try {
    const { command } = await request.json();
    
    if (!global.activeSandbox) {
      return NextResponse.json({ error: 'No active sandbox' }, { status: 400 });
    }

    const sandboxPath = global.activeSandbox.sandboxPath;
    
    console.log('[run-local-command] Running command in local sandbox:', command);
    console.log('[run-local-command] Working directory:', sandboxPath);

    try {
      const { stdout, stderr } = await execAsync(command, { 
        cwd: sandboxPath,
        timeout: 30000 // 30 second timeout
      });
      
      console.log('[run-local-command] Command executed successfully');
      if (stdout) console.log('[run-local-command] stdout:', stdout);
      if (stderr) console.log('[run-local-command] stderr:', stderr);

      return NextResponse.json({
        success: true,
        stdout: stdout || '',
        stderr: stderr || '',
        message: 'Command executed successfully'
      });

    } catch (execError: any) {
      console.error('[run-local-command] Command execution error:', execError);
      
      return NextResponse.json({
        success: false,
        stdout: execError.stdout || '',
        stderr: execError.stderr || '',
        error: execError.message,
        exitCode: execError.code
      });
    }

  } catch (error) {
    console.error('[run-local-command] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to run command' },
      { status: 500 }
    );
  }
}
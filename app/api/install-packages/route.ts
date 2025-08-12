import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

declare global {
  var activeSandbox: any;
  var sandboxData: any;
}

export async function POST(request: NextRequest) {
  try {
    const { packages, sandboxId } = await request.json();
    
    if (!packages || !Array.isArray(packages) || packages.length === 0) {
      return NextResponse.json({ 
        success: false, 
        error: 'Packages array is required' 
      }, { status: 400 });
    }
    
    if (!global.activeSandbox) {
      return NextResponse.json({ 
        success: false, 
        error: 'No active sandbox' 
      }, { status: 400 });
    }

    const sandboxPath = global.activeSandbox.sandboxPath;
    
    // Validate and deduplicate package names
    const validPackages = packages
      .filter((pkg: any) => typeof pkg === 'string' && pkg.trim().length > 0)
      .map((pkg: string) => pkg.trim())
      .filter((pkg: string, index: number, arr: string[]) => arr.indexOf(pkg) === index);

    if (validPackages.length === 0) {
      return NextResponse.json({ 
        success: false, 
        error: 'No valid packages provided' 
      }, { status: 400 });
    }

    console.log('[install-packages] Installing packages in local sandbox:', validPackages);
    console.log('[install-packages] Sandbox path:', sandboxPath);

    try {
      const installCommand = `npm install ${validPackages.join(' ')}`;
      const { stdout, stderr } = await execAsync(installCommand, {
        cwd: sandboxPath,
        timeout: 120000 // 2 minute timeout
      });

      console.log('[install-packages] Installation completed');
      if (stdout) console.log('[install-packages] stdout:', stdout);
      if (stderr && !stderr.includes('npm WARN')) {
        console.warn('[install-packages] stderr:', stderr);
      }

      return NextResponse.json({
        success: true,
        packages: validPackages,
        message: `Successfully installed ${validPackages.length} package(s)`,
        output: stdout || 'Packages installed successfully'
      });

    } catch (installError: any) {
      console.error('[install-packages] Installation failed:', installError);
      
      return NextResponse.json({
        success: false,
        packages: validPackages,
        error: `Failed to install packages: ${installError.message}`,
        output: installError.stdout || '',
        stderr: installError.stderr || ''
      }, { status: 500 });
    }

  } catch (error) {
    console.error('[install-packages] Error:', error);
    return NextResponse.json({ 
      success: false, 
      error: (error as Error).message 
    }, { status: 500 });
  }
}
import { NextRequest, NextResponse } from 'next/server';
import { sandboxClient } from '@/lib/sandbox-client';

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

    const activeSandboxId = global.activeSandbox.sandboxId;
    
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

    console.log('[install-packages] Installing packages in containerized sandbox:', validPackages);
    console.log('[install-packages] Sandbox ID:', activeSandboxId);

    // For containerized sandboxes, use the sandbox client
    if (global.activeSandbox.containerized) {
      try {
        const result = await sandboxClient.installPackages(activeSandboxId, validPackages);
        
        return NextResponse.json({
          success: result.success,
          packages: validPackages,
          message: result.message,
          installedPackages: result.installedPackages || validPackages
        });

      } catch (error: any) {
        console.error('[install-packages] Installation failed via sandbox client:', error);
        
        return NextResponse.json({
          success: false,
          packages: validPackages,
          error: `Failed to install packages: ${error.message}`
        }, { status: 500 });
      }
    } else {
      // Legacy path - should not be used anymore since we exclusively use containerized sandboxes
      console.warn('[install-packages] Legacy non-containerized sandbox detected - this should not happen');
      return NextResponse.json({
        success: false,
        error: 'Non-containerized sandboxes are no longer supported'
      }, { status: 400 });
    }

  } catch (error) {
    console.error('[install-packages] Error:', error);
    return NextResponse.json({ 
      success: false, 
      error: (error as Error).message 
    }, { status: 500 });
  }
}
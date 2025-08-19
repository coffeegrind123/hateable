import { NextRequest, NextResponse } from 'next/server';
import { sandboxClient } from '@/lib/sandbox-client';

declare global {
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
    
    if (!sandboxId) {
      return NextResponse.json({ 
        success: false, 
        error: 'Sandbox ID is required' 
      }, { status: 400 });
    }

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

    console.log('[install-packages-containerized] Installing packages in containerized sandbox:', validPackages);
    console.log('[install-packages-containerized] Sandbox ID:', sandboxId);

    try {
      // Use the sandbox service to install packages
      const response = await fetch(`${process.env.SANDBOX_SERVICE_URL}/api/sandbox/${sandboxId}/install-packages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          packages: validPackages
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
        throw new Error(errorData.error || `Failed to install packages: ${response.status}`);
      }

      const result = await response.json();

      console.log('[install-packages-containerized] Installation completed:', result);

      return NextResponse.json({
        success: true,
        packages: validPackages,
        message: `Successfully installed ${validPackages.length} package(s) in container`,
        installResult: result
      });

    } catch (installError: any) {
      console.error('[install-packages-containerized] Installation failed:', installError);
      
      return NextResponse.json({
        success: false,
        packages: validPackages,
        error: `Failed to install packages in container: ${installError.message}`,
      }, { status: 500 });
    }

  } catch (error) {
    console.error('[install-packages-containerized] Error:', error);
    return NextResponse.json({ 
      success: false, 
      error: (error as Error).message 
    }, { status: 500 });
  }
}
import { NextRequest, NextResponse } from 'next/server';
import type { SandboxState } from '@/types/sandbox';
import { sandboxClient } from '@/lib/sandbox-client';

// Store active sandbox info globally (for compatibility)
declare global {
  var sandboxData: any;
  var existingFiles: Set<string>;
  var sandboxState: SandboxState;
}

// Generate a unique sandbox ID
function generateSandboxId(): string {
  return `sandbox_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

export async function POST(request: NextRequest) {
  try {
    console.log('[create-local-sandbox] Using containerized sandbox service');
    
    // Parse request body
    const body = await request.json().catch(() => ({}));
    const existingSandboxId = body.existingSandboxId;
    const sourceUrl = body.sourceUrl || 'sandbox-app';
    
    let sandboxId: string;
    let sandboxUrl: string;
    
    if (existingSandboxId) {
      console.log('[create-local-sandbox] Validating existing sandbox:', existingSandboxId);
      
      // First validate that the sandbox actually exists
      const validationResult = await sandboxClient.validateSandbox(existingSandboxId);
      
      if (!validationResult.exists) {
        return NextResponse.json(
          { 
            success: false,
            error: `Sandbox ${existingSandboxId} does not exist`,
            code: 'SANDBOX_NOT_FOUND'
          },
          { status: 404 }
        );
      }
      
      console.log('[create-local-sandbox] Restoring validated sandbox:', existingSandboxId);
      sandboxId = existingSandboxId;
      sandboxUrl = sandboxClient.getPublicSandboxUrl(sandboxId);
    } else {
      // Create new sandbox
      sandboxId = generateSandboxId();
      console.log('[create-local-sandbox] Creating new sandbox:', sandboxId);
      
      // Use containerized sandbox service
      const result = await sandboxClient.createSandbox(sandboxId, sourceUrl);
      
      if (!result.success) {
        throw new Error(result.message || 'Failed to create sandbox in container');
      }
      
      sandboxUrl = sandboxClient.getPublicSandboxUrl(sandboxId);
    }
    
    // Set up global state for compatibility with existing code
    global.sandboxData = {
      sandboxId,
      url: sandboxUrl,
      id: sandboxId
    };
    
    // Initialize file tracking
    if (!global.existingFiles) {
      global.existingFiles = new Set<string>();
    } else {
      global.existingFiles.clear();
    }
    
    // Track initial files
    global.existingFiles.add('src/App.jsx');
    global.existingFiles.add('src/main.jsx');
    global.existingFiles.add('src/index.css');
    global.existingFiles.add('index.html');
    global.existingFiles.add('package.json');
    global.existingFiles.add('vite.config.js');
    global.existingFiles.add('tailwind.config.js');
    global.existingFiles.add('postcss.config.js');
    
    // Initialize sandbox state
    global.sandboxState = {
      fileCache: {
        files: {},
        lastSync: Date.now(),
        sandboxId
      },
      sandbox: { sandboxId },
      sandboxData: global.sandboxData
    };
    
    console.log('[create-local-sandbox] Containerized sandbox ready at:', sandboxUrl);
    
    return NextResponse.json({
      success: true,
      sandboxId,
      url: sandboxUrl,
      message: 'Containerized sandbox created successfully'
    });
    
  } catch (error) {
    console.error('[create-local-sandbox] Error:', error);
    
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Failed to create containerized sandbox',
        details: error instanceof Error ? error.stack : undefined
      },
      { status: 500 }
    );
  }
}

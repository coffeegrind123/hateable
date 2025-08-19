import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

// Simple proxy to serve sandbox files
export async function GET(
  request: NextRequest,
  { params }: { params: { path: string[] } }
) {
  try {
    const { searchParams } = request.nextUrl;
    const sandboxId = searchParams.get('sandbox');
    
    if (!sandboxId) {
      return new NextResponse('Sandbox ID required', { status: 400 });
    }
    
    // Construct file path
    const filePath = params.path.join('/') || 'index.html';
    const sandboxPath = path.join(process.cwd(), 'sandboxes', sandboxId);
    const fullFilePath = path.join(sandboxPath, filePath);
    
    console.log(`[sandbox-proxy] Serving ${filePath} for sandbox ${sandboxId}`);
    
    // Security check - ensure we're within the sandbox directory
    if (!fullFilePath.startsWith(sandboxPath)) {
      return new NextResponse('Access denied', { status: 403 });
    }
    
    // Check if file exists
    try {
      const stats = await fs.stat(fullFilePath);
      if (!stats.isFile()) {
        return new NextResponse('Not found', { status: 404 });
      }
    } catch {
      return new NextResponse('Not found', { status: 404 });
    }
    
    // Read and serve file
    const content = await fs.readFile(fullFilePath);
    const contentType = getContentType(filePath);
    
    // For HTML files, inject base tag and modify asset paths
    if (contentType === 'text/html') {
      let html = content.toString();
      
      // Inject base tag
      const baseHref = `/api/sandbox-proxy/?sandbox=${sandboxId}`;
      if (html.includes('<head>')) {
        html = html.replace('<head>', `<head>\n  <base href="${baseHref}">`);
      }
      
      return new NextResponse(html, {
        headers: {
          'Content-Type': contentType,
          'Cache-Control': 'no-cache',
        },
      });
    }
    
    return new NextResponse(content, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=300',
      },
    });
    
  } catch (error) {
    console.error('[sandbox-proxy] Error:', error);
    return new NextResponse('Server error', { status: 500 });
  }
}

function getContentType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const types: Record<string, string> = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.jsx': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
  };
  return types[ext] || 'text/plain';
}
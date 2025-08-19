import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { getSandboxRoute } from '@/lib/sandbox-router';

// Handle static file serving for sandboxes
export async function GET(
  request: NextRequest,
  { params }: { params: { sandboxId: string } }
) {
  try {
    const { sandboxId } = params;
    const { pathname, search } = request.nextUrl;
    
    console.log(`[sandbox-static] Request for sandbox ${sandboxId}: ${pathname}${search}`);
    
    // Get the sandbox route info
    const route = getSandboxRoute(sandboxId);
    if (!route) {
      console.log(`[sandbox-static] Sandbox route not found: ${sandboxId}`);
      return new NextResponse('Sandbox not found', { status: 404 });
    }
    
    // Extract the file path from the URL
    // URL format: /api/sandbox-static/{sandboxId}/path/to/file
    const urlParts = pathname.split('/');
    const sandboxIndex = urlParts.indexOf(sandboxId);
    const filePath = urlParts.slice(sandboxIndex + 1).join('/') || 'index.html';
    
    // Resolve the actual file path
    let actualFilePath: string;
    
    if (filePath === '' || filePath === 'index.html') {
      // Serve the main index.html
      actualFilePath = path.join(route.sandboxPath, 'index.html');
    } else if (filePath.startsWith('src/') || filePath.startsWith('assets/')) {
      // Development files - serve directly from Vite dev server
      return await proxyToViteServer(request, route.sandboxPath);
    } else {
      // Other static files
      actualFilePath = path.join(route.sandboxPath, filePath);
    }
    
    console.log(`[sandbox-static] Serving file: ${actualFilePath}`);
    
    // Check if file exists
    try {
      const stats = await fs.stat(actualFilePath);
      if (!stats.isFile()) {
        return new NextResponse('File not found', { status: 404 });
      }
    } catch (error) {
      console.log(`[sandbox-static] File not found: ${actualFilePath}`);
      return new NextResponse('File not found', { status: 404 });
    }
    
    // Read and serve the file
    const fileContent = await fs.readFile(actualFilePath);
    
    // Determine content type
    const contentType = getContentType(filePath);
    
    // If it's an HTML file, inject the base tag for proper asset loading
    if (contentType === 'text/html') {
      let htmlContent = fileContent.toString();
      
      // Inject base tag to ensure assets load correctly
      const baseTag = `<base href="/sandbox/${route.pathSegment}/">`;
      
      if (htmlContent.includes('<head>')) {
        htmlContent = htmlContent.replace('<head>', `<head>\n  ${baseTag}`);
      } else if (htmlContent.includes('<html>')) {
        htmlContent = htmlContent.replace('<html>', `<html>\n<head>\n  ${baseTag}\n</head>`);
      }
      
      return new NextResponse(htmlContent, {
        headers: {
          'Content-Type': contentType,
          'Cache-Control': 'no-cache, no-store, must-revalidate',
        },
      });
    }
    
    return new NextResponse(fileContent, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=3600',
      },
    });
    
  } catch (error) {
    console.error('[sandbox-static] Error serving file:', error);
    return new NextResponse('Internal server error', { status: 500 });
  }
}

// Proxy requests to the Vite dev server
async function proxyToViteServer(request: NextRequest, sandboxPath: string): Promise<NextResponse> {
  try {
    // Extract the file path for Vite
    const { pathname, search } = request.nextUrl;
    const viteUrl = `http://localhost:5173${pathname.replace('/api/sandbox-static/' + path.basename(sandboxPath), '')}${search}`;
    
    console.log(`[sandbox-static] Proxying to Vite: ${viteUrl}`);
    
    const response = await fetch(viteUrl);
    
    if (!response.ok) {
      return new NextResponse('File not found in Vite server', { status: response.status });
    }
    
    const content = await response.arrayBuffer();
    const contentType = response.headers.get('content-type') || 'application/octet-stream';
    
    return new NextResponse(content, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });
    
  } catch (error) {
    console.error('[sandbox-static] Error proxying to Vite:', error);
    return new NextResponse('Vite server error', { status: 500 });
  }
}

// Determine content type based on file extension
function getContentType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  
  const contentTypes: Record<string, string> = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.jsx': 'application/javascript',
    '.ts': 'application/javascript',
    '.tsx': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.eot': 'application/vnd.ms-fontobject',
  };
  
  return contentTypes[ext] || 'application/octet-stream';
}
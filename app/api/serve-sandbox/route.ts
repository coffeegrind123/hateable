import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { getSandboxRouteByPath } from '@/lib/sandbox-router';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const pathSegment = searchParams.get('path');
    const filePath = searchParams.get('file') || '/';
    
    if (!pathSegment) {
      return new NextResponse('Path segment required', { status: 400 });
    }
    
    console.log(`[serve-sandbox] Request for ${pathSegment}${filePath}`);
    
    // Get sandbox route info
    const route = getSandboxRouteByPath(pathSegment);
    if (!route) {
      console.log(`[serve-sandbox] Sandbox not found: ${pathSegment}`);
      return new NextResponse('Sandbox not found', { status: 404 });
    }
    
    // Determine file to serve
    let targetFile: string;
    let actualFilePath: string;
    
    if (filePath === '/' || filePath === '/index.html' || filePath === '') {
      // Serve main HTML file
      targetFile = 'index.html';
    } else {
      // Remove leading slash for relative path
      targetFile = filePath.startsWith('/') ? filePath.slice(1) : filePath;
    }
    
    // Try to serve from dist (production build) first, fallback to src
    const distPath = path.join(route.buildPath, targetFile);
    const srcPath = path.join(route.sandboxPath, targetFile);
    
    // Check if dist version exists
    try {
      await fs.access(distPath);
      actualFilePath = distPath;
      console.log(`[serve-sandbox] Serving from dist: ${actualFilePath}`);
    } catch {
      // Fallback to src
      try {
        await fs.access(srcPath);
        actualFilePath = srcPath;
        console.log(`[serve-sandbox] Serving from src: ${actualFilePath}`);
      } catch {
        // File not found
        console.log(`[serve-sandbox] File not found: ${targetFile}`);
        return new NextResponse('File not found', { status: 404 });
      }
    }
    
    // Read file content
    const content = await fs.readFile(actualFilePath);
    const contentType = getContentType(targetFile);
    
    // Handle HTML files specially - inject base href for proper asset loading
    if (contentType === 'text/html') {
      let html = content.toString();
      
      // Inject base href to ensure relative paths work
      const baseHref = `/sandbox/${pathSegment}/`;
      
      if (html.includes('<head>')) {
        html = html.replace('<head>', `<head>\n  <base href="${baseHref}">`);
      } else if (html.includes('<html>')) {
        html = html.replace('<html>', `<html>\n<head>\n  <base href="${baseHref}">\n</head>`);
      }
      
      return new NextResponse(html, {
        headers: {
          'Content-Type': contentType,
          'Cache-Control': 'no-cache, no-store, must-revalidate',
        },
      });
    }
    
    // Serve other files normally
    return new NextResponse(content, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=300',
      },
    });
    
  } catch (error) {
    console.error('[serve-sandbox] Error:', error);
    return new NextResponse('Internal server error', { status: 500 });
  }
}

function getContentType(fileName: string): string {
  const ext = path.extname(fileName).toLowerCase();
  
  const types: Record<string, string> = {
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
    '.map': 'application/json',
  };
  
  return types[ext] || 'application/octet-stream';
}
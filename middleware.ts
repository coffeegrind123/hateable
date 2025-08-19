import { NextRequest, NextResponse } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  
  // Handle sandbox routes - redirect to our API endpoint
  if (pathname.startsWith('/sandbox/')) {
    const pathSegment = pathname.replace('/sandbox/', '').split('/')[0];
    
    if (pathSegment) {
      // Extract any sub-path after the sandbox identifier
      const remainingPath = pathname.replace(`/sandbox/${pathSegment}`, '') || '/';
      
      // Rewrite to our sandbox serving API
      const url = request.nextUrl.clone();
      url.pathname = `/api/serve-sandbox`;
      url.searchParams.set('path', pathSegment);
      url.searchParams.set('file', remainingPath);
      
      console.log(`[middleware] Routing ${pathname} -> ${url.pathname}${url.search}`);
      
      return NextResponse.rewrite(url);
    }
  }
  
  return NextResponse.next();
}

export const config = {
  matcher: [
    '/sandbox/:path*'
  ]
};
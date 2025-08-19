import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json();
    
    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

    console.log('[scrape-screenshot-firecrawl] Capturing screenshot with local Firecrawl:', url);

    // Get Firecrawl API URL from environment
    const firecrawlApiUrl = process.env.FIRECRAWL_API_URL || 'http://localhost:3002';

    // Use Firecrawl API to capture screenshot
    const firecrawlResponse = await fetch(`${firecrawlApiUrl}/v1/scrape`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
        // No API key needed for self-hosted Firecrawl
      },
      body: JSON.stringify({
        url,
        formats: ['markdown', 'rawHtml', 'screenshot'], // Include screenshot in formats
        waitFor: 3000, // Wait for page to fully load
        timeout: 30000
      })
    });

    if (!firecrawlResponse.ok) {
      const error = await firecrawlResponse.text();
      throw new Error(`Firecrawl API error: ${error}`);
    }

    const data = await firecrawlResponse.json();
    
    if (!data.success) {
      throw new Error('Firecrawl API request failed');
    }
    
    // Check if screenshot was captured
    if (!data.data?.screenshot) {
      console.warn('[scrape-screenshot-firecrawl] No screenshot data returned - may be due to browser startup issues');
      // Return success but with null screenshot to indicate the issue
      return NextResponse.json({
        success: true,
        screenshot: null,
        metadata: {
          ...data.data?.metadata,
          scraper: 'firecrawl-local',
          timestamp: new Date().toISOString(),
          warning: 'Screenshot capture failed - browser may be initializing'
        }
      });
    }

    return NextResponse.json({
      success: true,
      screenshot: data.data.screenshot,
      metadata: {
        ...data.data.metadata,
        scraper: 'firecrawl-local',
        timestamp: new Date().toISOString()
      }
    });

  } catch (error: any) {
    console.error('[scrape-screenshot-firecrawl] Error:', error);
    return NextResponse.json({ 
      error: error.message || 'Failed to capture screenshot' 
    }, { status: 500 });
  }
}
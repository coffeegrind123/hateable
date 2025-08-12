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
        formats: ['screenshot'], // Regular viewport screenshot
        waitFor: 3000, // Wait for page to fully load
        timeout: 30000
      })
    });

    if (!firecrawlResponse.ok) {
      const error = await firecrawlResponse.text();
      throw new Error(`Firecrawl API error: ${error}`);
    }

    const data = await firecrawlResponse.json();
    
    if (!data.success || !data.data?.screenshot) {
      throw new Error('Failed to capture screenshot');
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
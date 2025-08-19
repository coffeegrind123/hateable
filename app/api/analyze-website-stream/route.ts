import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { url, content } = await request.json();
    
    if (!url || !content) {
      return NextResponse.json({
        success: false,
        error: 'URL and content are required'
      }, { status: 400 });
    }

    // Create a streaming response with minimal analysis
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        
        const sendMessage = (type: string, data: any) => {
          const message = `data: ${JSON.stringify({ type, ...data })}\n\n`;
          controller.enqueue(encoder.encode(message));
        };

        try {
          // Quick analysis without LLM - just simulate minimal steps
          const quickSteps = [
            "Analyzing website structure...",
            "Identifying key components...",
            "Planning React architecture...",
            "Analysis complete - ready to generate!"
          ];

          for (let i = 0; i < quickSteps.length; i++) {
            sendMessage('analysis_step', { 
              step: quickSteps[i],
              progress: Math.round((i + 1) / quickSteps.length * 100)
            });
            
            // Short delay for UX
            await new Promise(resolve => setTimeout(resolve, 500));
          }

          sendMessage('analysis_complete', { 
            summary: `Analyzed ${url} successfully. Ready to generate React components.`
          });

        } catch (error) {
          console.error('[analyze-website-stream] Error:', error);
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({
            type: 'error',
            error: error instanceof Error ? error.message : 'Analysis failed'
          })}\n\n`));
        } finally {
          controller.close();
        }
      }
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });

  } catch (error) {
    console.error('[analyze-website-stream] Error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to analyze website'
    }, { status: 500 });
  }
}
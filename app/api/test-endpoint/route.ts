import { NextRequest, NextResponse } from 'next/server';
import { createOpenAI } from '@ai-sdk/openai';
import { generateText } from 'ai';

export async function POST(request: NextRequest) {
  try {
    const { customEndpoint, testMessage } = await request.json();
    
    if (!customEndpoint?.url || !customEndpoint?.model) {
      return NextResponse.json({
        success: false,
        error: 'Endpoint URL and model are required'
      }, { status: 400 });
    }
    
    console.log('[test-endpoint] Testing connection to:', customEndpoint.url);
    console.log('[test-endpoint] Using model:', customEndpoint.model);
    
    // Create OpenAI-compatible client with custom endpoint
    const customOpenAI = createOpenAI({
      apiKey: customEndpoint.apiKey || 'test',
      baseURL: customEndpoint.url,
    });
    
    // Make a simple test request
    const result = await generateText({
      model: customOpenAI(customEndpoint.model),
      messages: [
        {
          role: 'user',
          content: testMessage || 'Say "Hello" to test the connection.'
        }
      ],
      temperature: 0.1
    });
    
    console.log('[test-endpoint] Test successful, response:', result.text);
    
    return NextResponse.json({
      success: true,
      message: 'Connection test successful',
      response: result.text,
      model: customEndpoint.model,
      endpoint: new URL(customEndpoint.url).hostname
    });
    
  } catch (error) {
    console.error('[test-endpoint] Test failed:', error);
    
    let errorMessage = 'Connection test failed';
    if (error instanceof Error) {
      if (error.message.includes('fetch failed')) {
        errorMessage = 'Could not connect to endpoint. Check URL and network connectivity.';
      } else if (error.message.includes('401') || error.message.includes('Unauthorized')) {
        errorMessage = 'Authentication failed. Check your API key.';
      } else if (error.message.includes('404') || error.message.includes('Not Found')) {
        errorMessage = 'Endpoint not found. Check your URL path.';
      } else if (error.message.includes('model')) {
        errorMessage = 'Model not found or not available. Check your model name.';
      } else {
        errorMessage = error.message;
      }
    }
    
    return NextResponse.json({
      success: false,
      error: errorMessage
    }, { status: 500 });
  }
}
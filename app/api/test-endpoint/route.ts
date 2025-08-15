import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { customEndpoint, testMessage } = await request.json();
    
    if (!customEndpoint?.url) {
      return NextResponse.json({
        success: false,
        error: 'Endpoint URL is required'
      }, { status: 400 });
    }
    
    console.log('[test-endpoint] Testing connection to:', customEndpoint.url);
    
    let modelToUse = customEndpoint.model;
    
    // If no model specified, fetch available models and use the first one
    if (!modelToUse) {
      try {
        const modelsUrl = customEndpoint.url.replace(/\/v1\/?$/, '') + '/v1/models';
        const modelsResponse = await fetch(modelsUrl, {
          headers: {
            'Authorization': `Bearer ${customEndpoint.apiKey || 'test'}`,
            'Content-Type': 'application/json'
          }
        });
        
        if (modelsResponse.ok) {
          const data = await modelsResponse.json();
          const models = data.data?.map((model: any) => model.id) || [];
          if (models.length > 0) {
            modelToUse = models[0];
            console.log('[test-endpoint] Auto-selected first available model:', modelToUse);
          }
        }
      } catch (error) {
        console.warn('[test-endpoint] Failed to fetch models, will try with default model');
      }
    }
    
    if (!modelToUse) {
      return NextResponse.json({
        success: false,
        error: 'No model specified and unable to fetch available models'
      }, { status: 400 });
    }
    
    console.log('[test-endpoint] Using model:', modelToUse);
    
    // Make a simple test request using direct HTTP call to bypass AI SDK issues
    const response = await fetch(`${customEndpoint.url}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${customEndpoint.apiKey || 'test'}`
      },
      body: JSON.stringify({
        model: modelToUse,
        messages: [
          {
            role: 'user',
            content: testMessage || 'Say "Hello" to test the connection.'
          }
        ],
        temperature: 0.1,
        stream: false
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }

    const data = await response.json();
    const result = {
      text: data.choices[0]?.message?.content || 'No response',
      usage: data.usage
    };
    
    console.log('[test-endpoint] Test successful, response:', result.text);
    
    return NextResponse.json({
      success: true,
      message: 'Connection test successful',
      response: result.text,
      model: modelToUse,
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
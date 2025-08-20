import { appConfig } from '@/config/app.config';

export interface FiresearchResult {
  success: boolean;
  query: string;
  sources?: Array<{
    url: string;
    title: string;
    content: string;
    answered?: boolean;
    confidence?: number;
  }>;
  subQueries?: Array<{
    question: string;
    answered: boolean;
    confidence: number;
  }>;
  totalSources: number;
  error?: string;
}

export class FiresearchClient {
  private baseUrl: string;

  constructor() {
    this.baseUrl = process.env.FIRESEARCH_API_URL || appConfig.firesearchApiUrl || 'http://localhost:3005';
  }

  /**
   * Perform intelligent search using Firesearch
   */
  async search(query: string, options: any = {}, customEndpoint?: any): Promise<FiresearchResult> {
    try {
      console.log(`[FiresearchClient] Searching: "${query}"`);
      
      const requestBody: any = {
        query,
        options
      };
      
      // Pass custom endpoint configuration to Firesearch if provided
      if (customEndpoint) {
        requestBody.customEndpoint = customEndpoint;
        console.log(`[FiresearchClient] Using custom endpoint: ${customEndpoint.url} with model: ${customEndpoint.model}`);
      }
      
      const response = await fetch(`${this.baseUrl}/api/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        throw new Error(`Firesearch API error: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();
      console.log(`[FiresearchClient] Search completed for "${query}". Found ${result.totalSources || 0} sources`);
      
      return result;
    } catch (error: any) {
      console.error(`[FiresearchClient] Search failed for "${query}":`, error);
      
      return {
        success: false,
        query,
        totalSources: 0,
        error: error.message || 'Search failed'
      };
    }
  }

  /**
   * Check if Firesearch service is available
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/search`, {
        method: 'GET',
        timeout: 5000 as any
      });
      
      return response.ok;
    } catch (error) {
      console.warn('[FiresearchClient] Health check failed:', error);
      return false;
    }
  }
}
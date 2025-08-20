import { FiresearchClient } from './firesearch-client';

export interface SearchCall {
  query: string;
  startIndex: number;
  endIndex: number;
}

export interface ProcessedPrompt {
  prompt: string;
  searchResults: any[];
  hasSearchCalls: boolean;
}

export class SearchFunctionParser {
  private firesearchClient: FiresearchClient;
  private customEndpoint?: any;

  constructor(customEndpoint?: any) {
    this.firesearchClient = new FiresearchClient();
    this.customEndpoint = customEndpoint;
  }

  /**
   * Parse search function calls from a prompt
   */
  parseSearchCalls(prompt: string): SearchCall[] {
    const searchRegex = /<search>(.*?)<\/search>/g;
    const searches: SearchCall[] = [];
    let match;

    while ((match = searchRegex.exec(prompt)) !== null) {
      searches.push({
        query: match[1].trim(),
        startIndex: match.index,
        endIndex: match.index + match[0].length
      });
    }

    return searches;
  }

  /**
   * Process a prompt by executing search calls and replacing them with results
   */
  async processPrompt(prompt: string): Promise<ProcessedPrompt> {
    const searchCalls = this.parseSearchCalls(prompt);
    
    if (searchCalls.length === 0) {
      return {
        prompt,
        searchResults: [],
        hasSearchCalls: false
      };
    }

    console.log(`[SearchFunctionParser] Found ${searchCalls.length} search calls`);

    let processedPrompt = prompt;
    const allSearchResults: any[] = [];
    
    // Process searches in reverse order to maintain string indices
    for (let i = searchCalls.length - 1; i >= 0; i--) {
      const searchCall = searchCalls[i];
      
      try {
        console.log(`[SearchFunctionParser] Executing search: "${searchCall.query}"`);
        
        // Perform the search using Firesearch
        const searchResult = await this.firesearchClient.search(searchCall.query, {}, this.customEndpoint);

        if (!searchResult.success) {
          throw new Error(searchResult.error || 'Search failed');
        }

        allSearchResults.unshift(searchResult); // Add to beginning to maintain order

        // Create replacement text with search results
        const replacementText = this.formatSearchResultsForPrompt(searchCall.query, searchResult);
        
        // Replace the search call with results
        processedPrompt = 
          processedPrompt.substring(0, searchCall.startIndex) + 
          replacementText + 
          processedPrompt.substring(searchCall.endIndex);

        console.log(`[SearchFunctionParser] Search "${searchCall.query}" completed with ${searchResult.totalSources} sources`);

      } catch (error) {
        console.error(`[SearchFunctionParser] Search failed for "${searchCall.query}":`, error);
        
        // Replace with error message
        const errorText = `[Search Error: Could not retrieve information for "${searchCall.query}"]`;
        processedPrompt = 
          processedPrompt.substring(0, searchCall.startIndex) + 
          errorText + 
          processedPrompt.substring(searchCall.endIndex);
      }
    }

    return {
      prompt: processedPrompt,
      searchResults: allSearchResults,
      hasSearchCalls: true
    };
  }

  /**
   * Format search results for inclusion in the prompt
   */
  private formatSearchResultsForPrompt(query: string, searchResult: any): string {
    const { sources, subQueries, totalSources } = searchResult;

    let formatted = `\n## Search Results for "${query}"\n\n`;
    
    if (!sources || sources.length === 0) {
      formatted += `No relevant results found for "${query}".\n\n`;
      return formatted;
    }

    // Add summary
    formatted += `**Search Summary:** Found ${sources.length} relevant sources`;
    if (subQueries && subQueries.length > 1) {
      const answeredCount = subQueries.filter((sq: any) => sq.answered).length;
      formatted += ` across ${subQueries.length} focused queries (${answeredCount} answered)`;
    }
    formatted += `\n\n`;

    // Add sub-queries status if available
    if (subQueries && subQueries.length > 1) {
      formatted += `**Research Questions:**\n`;
      subQueries.forEach((sq: any, index: number) => {
        const status = sq.answered ? '✅' : '❌';
        const confidence = sq.confidence ? ` (${(sq.confidence * 100).toFixed(0)}%)` : '';
        formatted += `${index + 1}. ${sq.question} ${status}${confidence}\n`;
      });
      formatted += `\n`;
    }

    // Add top results with content
    const topResults = sources.slice(0, 4);
    topResults.forEach((source: any, index: number) => {
      formatted += `### [${index + 1}] ${source.title}\n`;
      formatted += `**URL:** ${source.url}\n`;
      
      if (source.content) {
        // Include a substantial excerpt from the content
        const content = source.content;
        const excerpt = content.length > 800 ? content.substring(0, 800) + '...' : content;
        formatted += `**Content:**\n${excerpt}\n\n`;
      } else {
        formatted += `**No content available**\n\n`;
      }
    });

    // Add additional sources if available
    if (sources.length > 4) {
      formatted += `### Additional Sources\n`;
      sources.slice(4).forEach((source: any, index: number) => {
        formatted += `[${index + 5}] ${source.title} - ${source.url}\n`;
      });
      formatted += `\n`;
    }

    // Add search metadata
    formatted += `**Search completed at:** ${new Date().toISOString()}\n`;
    formatted += `**Total sources found:** ${totalSources}\n\n`;

    return formatted;
  }

  /**
   * Extract search queries from a prompt for preview purposes
   */
  extractSearchQueries(prompt: string): string[] {
    const searchCalls = this.parseSearchCalls(prompt);
    return searchCalls.map(call => call.query);
  }

  /**
   * Check if a prompt contains search function calls
   */
  hasSearchCalls(prompt: string): boolean {
    return /<search>.*?<\/search>/g.test(prompt);
  }
}
/**
 * Client for communicating with the containerized sandbox service
 */

interface SandboxFile {
  path: string;
  content: string;
}

interface SandboxInfo {
  sandboxId: string;
  sourceUrl: string;
  created: string;
  lastAccessed: string;
}

class SandboxServiceClient {
  private baseUrl: string;
  private publicBaseUrl: string;

  constructor() {
    // Use environment variable for sandbox service URL (internal communication)
    this.baseUrl = process.env.SANDBOX_SERVICE_URL!;
    // Use environment variable for public URL (browser access)
    this.publicBaseUrl = process.env.SANDBOX_PUBLIC_URL!;
  }

  /**
   * Create a new sandbox
   */
  async createSandbox(sandboxId: string, sourceUrl?: string): Promise<{ success: boolean; sandboxId: string; message: string }> {
    try {
      console.log(`[sandbox-client] Creating sandbox ${sandboxId} via container service`);
      
      const response = await fetch(`${this.baseUrl}/api/sandbox/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sandboxId,
          sourceUrl: sourceUrl || 'sandbox-app'
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
        throw new Error(errorData.error || `Failed to create sandbox: ${response.status}`);
      }

      const data = await response.json();
      console.log(`[sandbox-client] Sandbox ${sandboxId} created successfully`);
      
      return data;
    } catch (error) {
      console.error(`[sandbox-client] Error creating sandbox:`, error);
      throw error;
    }
  }

  /**
   * Apply code files to an existing sandbox
   */
  async applyCode(sandboxId: string, files: SandboxFile[]): Promise<{ success: boolean; message: string }> {
    try {
      console.log(`[sandbox-client] Applying ${files.length} files to sandbox ${sandboxId}`);
      
      const response = await fetch(`${this.baseUrl}/api/sandbox/${sandboxId}/apply-code`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          files
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
        
        // For BUILD_ERROR, return the full error response instead of throwing
        if (errorData.error === 'BUILD_ERROR') {
          console.log(`[sandbox-client] Build error occurred, returning structured error response`);
          return {
            success: false,
            error: errorData.error,
            message: errorData.message,
            buildError: errorData.buildError,
            sandboxId: errorData.sandboxId
          };
        }
        
        // For other errors, throw as before
        throw new Error(errorData.error || `Failed to apply code: ${response.status}`);
      }

      const data = await response.json();
      console.log(`[sandbox-client] Code applied to ${sandboxId} successfully`);
      
      return data;
    } catch (error) {
      console.error(`[sandbox-client] Error applying code:`, error);
      throw error;
    }
  }

  /**
   * Get all files from a sandbox
   */
  async getFiles(sandboxId: string): Promise<{ success: boolean; files: Record<string, string>; manifest: any }> {
    try {
      console.log(`[sandbox-client] Getting files from sandbox ${sandboxId}`);
      
      const response = await fetch(`${this.baseUrl}/api/sandbox/${sandboxId}/files`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
        throw new Error(errorData.error || `Failed to get files: ${response.status}`);
      }

      const data = await response.json();
      console.log(`[sandbox-client] Retrieved ${Object.keys(data.files || {}).length} files from ${sandboxId}`);
      
      return data;
    } catch (error) {
      console.error(`[sandbox-client] Error getting files:`, error);
      throw error;
    }
  }

  /**
   * Install packages in a sandbox
   */
  async installPackages(sandboxId: string, packages: string[]): Promise<{ success: boolean; message: string; installedPackages?: string[] }> {
    try {
      console.log(`[sandbox-client] Installing ${packages.length} packages in sandbox ${sandboxId}`);
      
      const response = await fetch(`${this.baseUrl}/api/sandbox/${sandboxId}/install-packages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          packages
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
        throw new Error(errorData.error || `Failed to install packages: ${response.status}`);
      }

      const data = await response.json();
      console.log(`[sandbox-client] Packages installed in ${sandboxId} successfully`);
      
      return data;
    } catch (error) {
      console.error(`[sandbox-client] Error installing packages:`, error);
      throw error;
    }
  }

  /**
   * Create a zip file of the sandbox
   */
  async createZip(sandboxId: string): Promise<{ success: boolean; filename: string; content: string; size: number }> {
    try {
      console.log(`[sandbox-client] Creating zip for sandbox ${sandboxId}`);
      
      const response = await fetch(`${this.baseUrl}/api/sandbox/${sandboxId}/create-zip`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
        throw new Error(errorData.error || `Failed to create zip: ${response.status}`);
      }

      const data = await response.json();
      console.log(`[sandbox-client] Zip created for ${sandboxId} successfully, size: ${data.size} bytes`);
      
      return data;
    } catch (error) {
      console.error(`[sandbox-client] Error creating zip:`, error);
      throw error;
    }
  }

  /**
   * Get sandbox URL for serving files
   */
  getSandboxUrl(sandboxId: string): string {
    return `${this.baseUrl}/api/sandbox/${sandboxId}/`;
  }

  /**
   * Get public URL that can be accessed from the main app
   */
  getPublicSandboxUrl(sandboxId: string): string {
    // Use the public URL that browsers can access
    return `${this.publicBaseUrl}/api/sandbox/${sandboxId}/`;
  }

  /**
   * List all active sandboxes
   */
  async listSandboxes(): Promise<{ sandboxes: SandboxInfo[]; total: number }> {
    try {
      const response = await fetch(`${this.baseUrl}/api/sandboxes`);
      
      if (!response.ok) {
        throw new Error(`Failed to list sandboxes: ${response.status}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error(`[sandbox-client] Error listing sandboxes:`, error);
      throw error;
    }
  }

  /**
   * Delete a sandbox
   */
  async deleteSandbox(sandboxId: string): Promise<{ success: boolean; message: string }> {
    try {
      console.log(`[sandbox-client] Deleting sandbox ${sandboxId}`);
      
      const response = await fetch(`${this.baseUrl}/api/sandbox/${sandboxId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
        throw new Error(errorData.error || `Failed to delete sandbox: ${response.status}`);
      }

      const data = await response.json();
      console.log(`[sandbox-client] Sandbox ${sandboxId} deleted successfully`);
      
      return data;
    } catch (error) {
      console.error(`[sandbox-client] Error deleting sandbox:`, error);
      throw error;
    }
  }

  /**
   * Validate if a sandbox exists
   */
  async validateSandbox(sandboxId: string): Promise<{ exists: boolean; info?: SandboxInfo }> {
    try {
      console.log(`[sandbox-client] Validating sandbox ${sandboxId}`);
      
      // Try to get sandbox info - if it exists, the service will return details
      const response = await fetch(`${this.baseUrl}/api/sandbox/${sandboxId}/info`);
      
      if (response.status === 404) {
        return { exists: false };
      }
      
      if (!response.ok) {
        // If it's not 404, treat other errors as "exists but has issues"
        console.warn(`[sandbox-client] Sandbox validation returned ${response.status}, assuming exists`);
        return { exists: true };
      }

      const data = await response.json();
      return { exists: true, info: data };
    } catch (error) {
      console.error(`[sandbox-client] Error validating sandbox:`, error);
      // On network errors, assume it doesn't exist to be safe
      return { exists: false };
    }
  }

  /**
   * Check if sandbox service is healthy
   */
  async healthCheck(): Promise<{ status: string; activeSandboxes: number; timestamp: string }> {
    try {
      const response = await fetch(`${this.baseUrl}/health`);
      
      if (!response.ok) {
        throw new Error(`Health check failed: ${response.status}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error(`[sandbox-client] Health check failed:`, error);
      throw error;
    }
  }

  /**
   * Proxy a request to the sandbox service (for serving files)
   */
  async proxyRequest(sandboxId: string, filePath: string = ''): Promise<Response> {
    const url = `${this.baseUrl}/api/sandbox/${sandboxId}/${filePath}`;
    
    try {
      const response = await fetch(url);
      return response;
    } catch (error) {
      console.error(`[sandbox-client] Error proxying request:`, error);
      throw error;
    }
  }
}

// Export singleton instance
export const sandboxClient = new SandboxServiceClient();

// Export types
export type { SandboxFile, SandboxInfo };
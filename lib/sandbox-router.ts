/**
 * Sandbox Path-Based Routing System
 * 
 * Instead of using multiple ports, this system routes different sandboxes
 * to different paths on a single Vite server.
 * 
 * Examples:
 * - etf2l.org -> /sandbox/etf2l-org
 * - github.com -> /sandbox/github-com  
 * - my-awesome-site.dev -> /sandbox/my-awesome-site-dev
 */

// Global sandbox routing registry
declare global {
  var sandboxRoutes: Map<string, SandboxRoute>;
}

export interface SandboxRoute {
  sandboxId: string;
  originalUrl: string;
  pathSegment: string;
  sandboxPath: string;
  buildPath: string;
  created: Date;
  lastAccessed: Date;
}

// Initialize global state
if (!global.sandboxRoutes) {
  global.sandboxRoutes = new Map();
}

/**
 * Convert a URL/domain to a safe path segment
 */
export function urlToPathSegment(url: string): string {
  // Remove protocol
  let cleaned = url.replace(/^https?:\/\//i, '');
  
  // Remove www prefix
  cleaned = cleaned.replace(/^www\./i, '');
  
  // Remove trailing slash and path
  cleaned = cleaned.split('/')[0];
  
  // Replace dots with hyphens, remove special characters
  cleaned = cleaned
    .toLowerCase()
    .replace(/\./g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  
  // Ensure it starts with a letter (for valid CSS/JS identifiers)
  if (!/^[a-z]/.test(cleaned)) {
    cleaned = 'site-' + cleaned;
  }
  
  // Limit length
  if (cleaned.length > 50) {
    cleaned = cleaned.substring(0, 50);
  }
  
  return cleaned;
}

/**
 * Generate a unique sandbox path for a URL
 */
export function generateSandboxPath(url: string, sandboxId: string): string {
  const baseSegment = urlToPathSegment(url);
  
  // Add timestamp suffix to make it unique
  const timestamp = Date.now().toString(36);
  
  return `${baseSegment}-${timestamp}`;
}

/**
 * Register a new sandbox route
 */
export function registerSandboxRoute(sandboxId: string, originalUrl: string, sandboxPath: string): SandboxRoute {
  const pathSegment = generateSandboxPath(originalUrl, sandboxId);
  
  const route: SandboxRoute = {
    sandboxId,
    originalUrl,
    pathSegment,
    sandboxPath,
    buildPath: `${sandboxPath}/dist`,
    created: new Date(),
    lastAccessed: new Date()
  };
  
  global.sandboxRoutes.set(sandboxId, route);
  
  console.log(`[sandbox-router] Registered route: ${originalUrl} -> /sandbox/${pathSegment}`);
  
  return route;
}

/**
 * Get sandbox route by ID
 */
export function getSandboxRoute(sandboxId: string): SandboxRoute | null {
  const route = global.sandboxRoutes.get(sandboxId);
  if (route) {
    route.lastAccessed = new Date();
  }
  return route || null;
}

/**
 * Get sandbox route by path segment
 */
export function getSandboxRouteByPath(pathSegment: string): SandboxRoute | null {
  for (const route of global.sandboxRoutes.values()) {
    if (route.pathSegment === pathSegment) {
      route.lastAccessed = new Date();
      return route;
    }
  }
  return null;
}

/**
 * Remove a sandbox route
 */
export function unregisterSandboxRoute(sandboxId: string): void {
  const route = global.sandboxRoutes.get(sandboxId);
  if (route) {
    console.log(`[sandbox-router] Unregistered route: ${route.originalUrl} -> /sandbox/${route.pathSegment}`);
    global.sandboxRoutes.delete(sandboxId);
  }
}

/**
 * Get the full sandbox URL
 */
export function getSandboxUrl(sandboxId: string, baseUrl: string = 'http://localhost:5173'): string | null {
  const route = getSandboxRoute(sandboxId);
  if (!route) return null;
  
  return `${baseUrl}/sandbox/${route.pathSegment}`;
}

/**
 * List all active routes
 */
export function getAllSandboxRoutes(): SandboxRoute[] {
  return Array.from(global.sandboxRoutes.values());
}

/**
 * Clean up old routes (older than specified minutes)
 */
export function cleanupOldRoutes(maxAgeMinutes: number = 60): void {
  const cutoff = new Date(Date.now() - maxAgeMinutes * 60 * 1000);
  const toRemove: string[] = [];
  
  for (const [sandboxId, route] of global.sandboxRoutes.entries()) {
    if (route.lastAccessed < cutoff) {
      toRemove.push(sandboxId);
    }
  }
  
  for (const sandboxId of toRemove) {
    unregisterSandboxRoute(sandboxId);
  }
  
  if (toRemove.length > 0) {
    console.log(`[sandbox-router] Cleaned up ${toRemove.length} old routes`);
  }
}

/**
 * Generate preview URL for sharing
 */
export function generatePreviewUrl(sandboxId: string, domain: string = 'localhost:5173'): string | null {
  const route = getSandboxRoute(sandboxId);
  if (!route) return null;
  
  // For deployment, you could use actual domains like:
  // return `https://${route.pathSegment}.your-domain.com`;
  
  return `http://${domain}/sandbox/${route.pathSegment}`;
}
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Port range for sandbox allocation
const PORT_RANGE_START = 5173;
const PORT_RANGE_END = 5273; // 100 ports available
const RESERVED_PORTS = new Set([5173]); // Keep 5173 for main dev server

// Global port tracking
declare global {
  var allocatedPorts: Map<string, number>;
  var portLocks: Set<number>;
}

// Initialize global state
if (!global.allocatedPorts) {
  global.allocatedPorts = new Map();
}
if (!global.portLocks) {
  global.portLocks = new Set();
}

/**
 * Check if a port is available
 */
async function isPortAvailable(port: number): Promise<boolean> {
  try {
    // Check if port is in use using netstat
    const { stdout } = await execAsync(`netstat -ln | grep :${port} || echo "not found"`);
    return stdout.includes('not found');
  } catch (error) {
    // If netstat fails, try lsof
    try {
      await execAsync(`lsof -i :${port}`);
      return false; // Port is in use
    } catch {
      return true; // Port appears to be available
    }
  }
}

/**
 * Find the next available port in our range
 */
async function findAvailablePort(): Promise<number> {
  for (let port = PORT_RANGE_START; port <= PORT_RANGE_END; port++) {
    // Skip reserved ports
    if (RESERVED_PORTS.has(port)) continue;
    
    // Skip already locked ports
    if (global.portLocks.has(port)) continue;
    
    // Check if port is actually available on the system
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  
  throw new Error(`No available ports in range ${PORT_RANGE_START}-${PORT_RANGE_END}`);
}

/**
 * Allocate a port for a sandbox
 */
export async function allocatePort(sandboxId: string): Promise<number> {
  // Check if sandbox already has a port allocated
  const existingPort = global.allocatedPorts.get(sandboxId);
  if (existingPort && global.portLocks.has(existingPort)) {
    console.log(`[port-manager] Reusing existing port ${existingPort} for sandbox ${sandboxId}`);
    return existingPort;
  }
  
  // Find a new port
  const port = await findAvailablePort();
  
  // Lock the port and associate with sandbox
  global.portLocks.add(port);
  global.allocatedPorts.set(sandboxId, port);
  
  console.log(`[port-manager] Allocated port ${port} for sandbox ${sandboxId}`);
  return port;
}

/**
 * Release a port when sandbox is destroyed
 */
export function releasePort(sandboxId: string): void {
  const port = global.allocatedPorts.get(sandboxId);
  if (port) {
    global.portLocks.delete(port);
    global.allocatedPorts.delete(sandboxId);
    console.log(`[port-manager] Released port ${port} for sandbox ${sandboxId}`);
  }
}

/**
 * Get the port for a specific sandbox
 */
export function getPortForSandbox(sandboxId: string): number | null {
  return global.allocatedPorts.get(sandboxId) || null;
}

/**
 * List all allocated ports (for debugging)
 */
export function getAllocatedPorts(): Record<string, number> {
  return Object.fromEntries(global.allocatedPorts.entries());
}

/**
 * Clean up orphaned ports (ports that are locked but not actually in use)
 */
export async function cleanupOrphanedPorts(): Promise<void> {
  console.log('[port-manager] Cleaning up orphaned ports...');
  
  const portsToCleanup: number[] = [];
  
  for (const port of global.portLocks) {
    if (await isPortAvailable(port)) {
      portsToCleanup.push(port);
    }
  }
  
  for (const port of portsToCleanup) {
    // Find the sandbox using this port and remove it
    for (const [sandboxId, allocatedPort] of global.allocatedPorts.entries()) {
      if (allocatedPort === port) {
        console.log(`[port-manager] Cleaning up orphaned port ${port} from sandbox ${sandboxId}`);
        releasePort(sandboxId);
        break;
      }
    }
  }
  
  console.log(`[port-manager] Cleaned up ${portsToCleanup.length} orphaned ports`);
}

/**
 * Force release all ports (for emergency cleanup)
 */
export function releaseAllPorts(): void {
  console.log('[port-manager] Force releasing all ports');
  global.portLocks.clear();
  global.allocatedPorts.clear();
}
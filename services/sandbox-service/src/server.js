import express from 'express';
import cors from 'cors';
import { promises as fs } from 'fs';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import path from 'path';

const execAsync = promisify(exec);
const app = express();
const PORT = process.env.PORT || 3004;

// Add process error handlers to prevent crashes
process.on('uncaughtException', (error) => {
  console.error('[sandbox-service] Uncaught Exception:', error);
  // Don't exit the process, just log the error
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[sandbox-service] Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't exit the process, just log the error
});

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
// Note: Static middleware moved after API routes to prevent conflicts

// Global state for managing sandboxes
const activeSandboxes = new Map();
const buildQueue = new Map();

// Helper function to get files recursively
async function getFilesRecursively(dirPath, basePath) {
  const files = {};
  
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      const relativePath = path.relative(basePath, fullPath);
      
      // Skip node_modules, .git, and other build artifacts
      if (entry.name === 'node_modules' || 
          entry.name === '.git' || 
          entry.name === 'dist' || 
          entry.name === 'build' ||
          entry.name.startsWith('.')) {
        continue;
      }
      
      if (entry.isDirectory()) {
        const subFiles = await getFilesRecursively(fullPath, basePath);
        Object.assign(files, subFiles);
      } else if (entry.isFile()) {
        // Only include common text files
        const ext = path.extname(entry.name).toLowerCase();
        if (['.js', '.jsx', '.ts', '.tsx', '.json', '.css', '.html', '.md', '.txt'].includes(ext)) {
          try {
            const content = await fs.readFile(fullPath, 'utf-8');
            files[relativePath.replace(/\\/g, '/')] = content;
          } catch (readError) {
            console.warn(`Could not read file ${relativePath}:`, readError);
          }
        }
      }
    }
  } catch (error) {
    console.error(`Error reading directory ${dirPath}:`, error);
  }
  
  return files;
}

// Helper function to generate file manifest
function generateFileManifest(files) {
  const manifest = {
    files: {},
    structure: {},
    lastSync: Date.now()
  };
  
  for (const [filePath, content] of Object.entries(files)) {
    manifest.files[filePath] = {
      size: content.length,
      lastModified: Date.now(),
      type: path.extname(filePath) || 'file',
      componentInfo: filePath.endsWith('.jsx') || filePath.endsWith('.tsx') ? {
        name: path.basename(filePath, path.extname(filePath)),
        isComponent: true
      } : undefined
    };
  }
  
  return manifest;
}

// Function to load existing sandboxes from disk on startup
async function loadExistingSandboxes() {
  console.log('[sandbox-service] Starting loadExistingSandboxes function...');
  try {
    console.log('[sandbox-service] Loading existing sandboxes from disk...');
    const sandboxesDir = '/app/sandboxes';
    
    // Check if sandboxes directory exists
    try {
      await fs.access(sandboxesDir);
    } catch {
      console.log('[sandbox-service] No sandboxes directory found, creating...');
      await fs.mkdir(sandboxesDir, { recursive: true });
      return;
    }
    
    const entries = await fs.readdir(sandboxesDir, { withFileTypes: true });
    const sandboxDirs = entries.filter(entry => 
      entry.isDirectory() && entry.name.startsWith('sandbox_')
    );
    
    let loadedCount = 0;
    for (const dir of sandboxDirs) {
      try {
        const sandboxId = dir.name;
        const sandboxPath = path.join(sandboxesDir, sandboxId);
        const buildPath = path.join(sandboxPath, 'dist');
        
        // Check if the sandbox has required files
        const packageJsonPath = path.join(sandboxPath, 'package.json');
        const indexHtmlPath = path.join(buildPath, 'index.html');
        
        await fs.access(packageJsonPath);
        await fs.access(indexHtmlPath);
        
        // Get creation time from directory stats
        const stats = await fs.stat(sandboxPath);
        
        // Register the sandbox
        activeSandboxes.set(sandboxId, {
          sandboxId,
          sandboxPath,
          sourceUrl: 'recovered', // Mark as recovered
          buildPath,
          created: stats.birthtime || stats.ctime,
          lastAccessed: new Date() // Set current time as last accessed
        });
        
        loadedCount++;
        console.log(`[sandbox-service] Loaded sandbox: ${sandboxId}`);
      } catch (error) {
        console.warn(`[sandbox-service] Failed to load sandbox ${dir.name}:`, error.message);
      }
    }
    
    console.log(`[sandbox-service] Loaded ${loadedCount} existing sandboxes`);
  } catch (error) {
    console.error('[sandbox-service] Error loading existing sandboxes:', error);
  }
}

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    activeSandboxes: activeSandboxes.size,
    timestamp: new Date().toISOString()
  });
});

// Create a new sandbox
app.post('/api/sandbox/create', async (req, res) => {
  try {
    const { sandboxId, sourceUrl = 'sandbox-app' } = req.body;
    
    if (!sandboxId) {
      return res.status(400).json({ error: 'sandboxId is required' });
    }
    
    console.log(`[sandbox-service] Creating sandbox: ${sandboxId}`);
    
    const sandboxPath = path.join('/app/sandboxes', sandboxId);
    
    // Create sandbox directory structure
    await fs.mkdir(sandboxPath, { recursive: true });
    await fs.mkdir(path.join(sandboxPath, 'src'), { recursive: true });
    await fs.mkdir(path.join(sandboxPath, 'src', 'components'), { recursive: true });
    
    // Create package.json
    const packageJson = {
      name: "sandbox-app",
      version: "1.0.0",
      type: "module",
      scripts: {
        dev: "vite --host 0.0.0.0 --port 5173",
        build: "vite build",
        preview: "vite preview --host 0.0.0.0 --port 5173"
      },
      dependencies: {
        react: "^18.2.0",
        "react-dom": "^18.2.0"
      },
      devDependencies: {
        "@vitejs/plugin-react": "^4.0.0",
        vite: "^4.3.9",
        tailwindcss: "^3.3.0",
        postcss: "^8.4.31",
        autoprefixer: "^10.4.16"
      }
    };
    
    await fs.writeFile(
      path.join(sandboxPath, 'package.json'),
      JSON.stringify(packageJson, null, 2)
    );
    
    // Create vite.config.js
    const viteConfig = `import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: false,
    hmr: false
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    minify: 'esbuild'
  }
})`;
    
    await fs.writeFile(path.join(sandboxPath, 'vite.config.js'), viteConfig);
    
    // Create tailwind.config.js
    const tailwindConfig = `/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}`;
    
    await fs.writeFile(path.join(sandboxPath, 'tailwind.config.js'), tailwindConfig);
    
    // Create postcss.config.js
    const postcssConfig = `export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}`;
    
    await fs.writeFile(path.join(sandboxPath, 'postcss.config.js'), postcssConfig);
    
    // Create index.html
    const indexHtml = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Sandbox App</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>`;
    
    await fs.writeFile(path.join(sandboxPath, 'index.html'), indexHtml);
    
    // Create src/main.jsx
    const mainJsx = `import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)`;
    
    await fs.writeFile(path.join(sandboxPath, 'src', 'main.jsx'), mainJsx);
    
    // Create src/App.jsx
    const appJsx = `function App() {
  return (
    <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center p-4">
      <div className="text-center max-w-2xl">
        <h1 className="text-4xl font-bold mb-4 text-blue-400">
          Sandbox Ready
        </h1>
        <p className="text-lg text-gray-400">
          Your containerized sandbox is ready for development!<br/>
          Start building your React app with Vite and Tailwind CSS.
        </p>
      </div>
    </div>
  )
}

export default App`;
    
    await fs.writeFile(path.join(sandboxPath, 'src', 'App.jsx'), appJsx);
    
    // Create src/index.css
    const indexCss = `@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    font-synthesis: none;
    text-rendering: optimizeLegibility;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    -webkit-text-size-adjust: 100%;
  }
  
  * {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
  background-color: rgb(17 24 39);
}`;
    
    await fs.writeFile(path.join(sandboxPath, 'src', 'index.css'), indexCss);
    
    // Install dependencies with retry logic and longer timeout
    console.log(`[sandbox-service] Installing dependencies for ${sandboxId}`);
    let installSuccess = false;
    let installAttempts = 0;
    const maxInstallAttempts = 3;
    
    while (!installSuccess && installAttempts < maxInstallAttempts) {
      installAttempts++;
      try {
        console.log(`[sandbox-service] Install attempt ${installAttempts}/${maxInstallAttempts} for ${sandboxId}`);
        await execAsync('pnpm install --reporter=default', { 
          cwd: sandboxPath,
          timeout: 300000, // 5 minutes timeout
          env: { ...process.env, NODE_ENV: 'production' }
        });
        installSuccess = true;
        console.log(`[sandbox-service] Dependencies installed successfully for ${sandboxId}`);
      } catch (installError) {
        console.error(`[sandbox-service] Install attempt ${installAttempts} failed for ${sandboxId}:`, installError.message);
        
        if (installAttempts === maxInstallAttempts) {
          // Final attempt failed - clean up and throw error
          console.error(`[sandbox-service] All install attempts failed for ${sandboxId}, cleaning up...`);
          try {
            await fs.rm(sandboxPath, { recursive: true, force: true });
          } catch (cleanupError) {
            console.error(`[sandbox-service] Cleanup failed for ${sandboxId}:`, cleanupError.message);
          }
          throw new Error(`Package installation failed after ${maxInstallAttempts} attempts: ${installError.message}`);
        } else {
          // Wait before retry
          console.log(`[sandbox-service] Waiting 2 seconds before retry for ${sandboxId}...`);
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
    }
    
    // Build production files with retry logic
    console.log(`[sandbox-service] Building production files for ${sandboxId}`);
    let buildSuccess = false;
    let buildAttempts = 0;
    const maxBuildAttempts = 2;
    
    while (!buildSuccess && buildAttempts < maxBuildAttempts) {
      buildAttempts++;
      try {
        console.log(`[sandbox-service] Build attempt ${buildAttempts}/${maxBuildAttempts} for ${sandboxId}`);
        await execAsync('pnpm run build', {
          cwd: sandboxPath,
          timeout: 300000, // 5 minutes timeout
          env: { ...process.env, NODE_ENV: 'production' }
        });
        buildSuccess = true;
        console.log(`[sandbox-service] Build completed successfully for ${sandboxId}`);
      } catch (buildError) {
        console.error(`[sandbox-service] Build attempt ${buildAttempts} failed for ${sandboxId}:`, buildError.message);
        
        if (buildAttempts === maxBuildAttempts) {
          // Final attempt failed - clean up and throw error
          console.error(`[sandbox-service] All build attempts failed for ${sandboxId}, cleaning up...`);
          try {
            await fs.rm(sandboxPath, { recursive: true, force: true });
          } catch (cleanupError) {
            console.error(`[sandbox-service] Cleanup failed for ${sandboxId}:`, cleanupError.message);
          }
          throw new Error(`Build failed after ${maxBuildAttempts} attempts: ${buildError.message}`);
        } else {
          console.log(`[sandbox-service] Waiting 1 second before build retry for ${sandboxId}...`);
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    }
    
    // Register sandbox
    activeSandboxes.set(sandboxId, {
      sandboxId,
      sandboxPath,
      sourceUrl,
      buildPath: path.join(sandboxPath, 'dist'),
      created: new Date(),
      lastAccessed: new Date()
    });
    
    console.log(`[sandbox-service] Sandbox ${sandboxId} created successfully`);
    
    res.json({
      success: true,
      sandboxId,
      message: 'Sandbox created and built successfully'
    });
    
  } catch (error) {
    console.error(`[sandbox-service] Error creating sandbox:`, error);
    res.status(500).json({
      error: error.message,
      details: error.stack
    });
  }
});

// Install packages in existing sandbox
app.post('/api/sandbox/:sandboxId/install-packages', async (req, res) => {
  try {
    const { sandboxId } = req.params;
    const { packages } = req.body;
    
    if (!packages || !Array.isArray(packages) || packages.length === 0) {
      return res.status(400).json({ error: 'packages array is required' });
    }
    
    const sandbox = activeSandboxes.get(sandboxId);
    if (!sandbox) {
      return res.status(404).json({ error: 'Sandbox not found' });
    }
    
    console.log(`[sandbox-service] Installing packages in ${sandboxId}:`, packages);
    
    // Validate and deduplicate package names
    const validPackages = packages
      .filter(pkg => typeof pkg === 'string' && pkg.trim().length > 0)
      .map(pkg => pkg.trim())
      .filter((pkg, index, arr) => arr.indexOf(pkg) === index);
    
    if (validPackages.length === 0) {
      return res.status(400).json({ error: 'No valid packages provided' });
    }
    
    try {
      // Install packages using pnpm
      const installCommand = `pnpm install ${validPackages.join(' ')}`;
      console.log(`[sandbox-service] Running: ${installCommand}`);
      
      const { stdout, stderr } = await execAsync(installCommand, {
        cwd: sandbox.sandboxPath,
        timeout: 300000 // 5 minute timeout for package installation
      });
      
      // Verify packages were installed by checking package.json
      const packageJsonPath = path.join(sandbox.sandboxPath, 'package.json');
      const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf8'));
      
      const installedPackages = [];
      const failedPackages = [];
      
      for (const pkg of validPackages) {
        if (packageJson.dependencies?.[pkg] || packageJson.devDependencies?.[pkg]) {
          installedPackages.push(pkg);
        } else {
          failedPackages.push(pkg);
        }
      }
      
      console.log(`[sandbox-service] Package installation completed for ${sandboxId}`);
      console.log(`[sandbox-service] Installed: ${installedPackages.join(', ')}`);
      if (failedPackages.length > 0) {
        console.log(`[sandbox-service] Failed: ${failedPackages.join(', ')}`);
      }
      
      sandbox.lastAccessed = new Date();
      
      res.json({
        success: true,
        packagesInstalled: installedPackages,
        packagesFailed: failedPackages,
        message: `Installed ${installedPackages.length} packages successfully`,
        output: stdout
      });
      
    } catch (installError) {
      console.error(`[sandbox-service] Package installation failed:`, installError);
      res.status(500).json({
        success: false,
        error: `Package installation failed: ${installError.message}`,
        stderr: installError.stderr || '',
        stdout: installError.stdout || ''
      });
    }
    
  } catch (error) {
    console.error(`[sandbox-service] Error installing packages:`, error);
    res.status(500).json({
      error: error.message
    });
  }
});

// Rebuild existing sandbox
app.post('/api/sandbox/:sandboxId/rebuild', async (req, res) => {
  try {
    const { sandboxId } = req.params;
    
    const sandbox = activeSandboxes.get(sandboxId);
    if (!sandbox) {
      return res.status(404).json({ error: 'Sandbox not found' });
    }
    
    console.log(`[sandbox-service] Rebuilding ${sandboxId}`);
    
    try {
      await execAsync('pnpm run build', {
        cwd: sandbox.sandboxPath,
        timeout: 180000
      });
      
      console.log(`[sandbox-service] Rebuild successful for ${sandboxId}`);
      sandbox.lastAccessed = new Date();
      
      res.json({
        success: true,
        message: 'Rebuild completed successfully'
      });
      
    } catch (buildError) {
      console.error(`[sandbox-service] Rebuild failed for ${sandboxId}:`, buildError);
      res.status(500).json({
        success: false,
        error: `Rebuild failed: ${buildError.message}`,
        stderr: buildError.stderr || ''
      });
    }
    
  } catch (error) {
    console.error(`[sandbox-service] Error rebuilding:`, error);
    res.status(500).json({
      error: error.message
    });
  }
});

// Apply code to existing sandbox
app.post('/api/sandbox/:sandboxId/apply-code', async (req, res) => {
  try {
    const { sandboxId } = req.params;
    const { files } = req.body;
    
    if (!files || !Array.isArray(files)) {
      return res.status(400).json({ error: 'files array is required' });
    }
    
    const sandbox = activeSandboxes.get(sandboxId);
    if (!sandbox) {
      return res.status(404).json({ error: 'Sandbox not found' });
    }
    
    console.log(`[sandbox-service] Applying code to ${sandboxId}: ${files.length} files`);
    
    // Extract packages from files before applying
    const detectedPackages = new Set();
    const importRegex = /import\s+(?:(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)(?:\s*,\s*(?:\{[^}]*\}|\*\s+as\s+\w+|\w+))*\s+from\s+)?['"]([^'"]+)['"]/g;
    
    for (const file of files) {
      if (file.path.match(/\.(jsx?|tsx?)$/)) {
        let match;
        while ((match = importRegex.exec(file.content)) !== null) {
          const importPath = match[1];
          // Skip relative imports and built-in modules
          if (!importPath.startsWith('.') && !importPath.startsWith('/') && 
              importPath !== 'react' && importPath !== 'react-dom' &&
              !importPath.startsWith('@/')) {
            const packageName = importPath.startsWith('@') 
              ? importPath.split('/').slice(0, 2).join('/')
              : importPath.split('/')[0];
            detectedPackages.add(packageName);
          }
        }
      }
    }
    
    // Install detected packages if any
    if (detectedPackages.size > 0) {
      const packagesArray = Array.from(detectedPackages);
      console.log(`[sandbox-service] Detected packages to install: ${packagesArray.join(', ')}`);
      
      try {
        const installCommand = `pnpm install ${packagesArray.join(' ')}`;
        await execAsync(installCommand, {
          cwd: sandbox.sandboxPath,
          timeout: 300000 // 5 minute timeout
        });
        console.log(`[sandbox-service] Successfully installed detected packages`);
      } catch (installError) {
        console.warn(`[sandbox-service] Failed to install some packages:`, installError.message);
        // Continue with file application even if package installation fails
      }
    }
    
    // Apply files
    for (const file of files) {
      const fullPath = path.join(sandbox.sandboxPath, file.path);
      const dirPath = path.dirname(fullPath);
      
      await fs.mkdir(dirPath, { recursive: true });
      await fs.writeFile(fullPath, file.content);
    }
    
    // Rebuild
    console.log(`[sandbox-service] Rebuilding ${sandboxId}`);
    await execAsync('pnpm run build', {
      cwd: sandbox.sandboxPath,
      timeout: 180000
    });
    
    sandbox.lastAccessed = new Date();
    
    res.json({
      success: true,
      message: `Applied ${files.length} files and rebuilt successfully`
    });
    
  } catch (error) {
    console.error(`[sandbox-service] Error applying code:`, error);
    res.status(500).json({
      error: error.message
    });
  }
});

// Get sandbox info (must be before wildcard route)
app.get('/api/sandbox/:sandboxId/info', (req, res) => {
  console.log(`[sandbox-service] Info endpoint hit for ${req.params.sandboxId}`);
  const { sandboxId } = req.params;
  
  const sandbox = activeSandboxes.get(sandboxId);
  if (!sandbox) {
    console.log(`[sandbox-service] Sandbox ${sandboxId} not found in registry`);
    return res.status(404).json({ error: 'Sandbox not found' });
  }
  
  // Update last accessed time
  sandbox.lastAccessed = new Date();
  
  console.log(`[sandbox-service] Returning info for ${sandboxId}`);
  res.json({
    sandboxId: sandbox.sandboxId,
    sourceUrl: sandbox.sourceUrl,
    created: sandbox.created,
    lastAccessed: sandbox.lastAccessed,
    buildPath: sandbox.buildPath
  });
});

// Get all files from a sandbox
app.get('/api/sandbox/:sandboxId/files', async (req, res) => {
  try {
    const { sandboxId } = req.params;
    console.log(`[sandbox-service] Files endpoint hit for ${sandboxId}`);
    
    const sandbox = activeSandboxes.get(sandboxId);
    if (!sandbox) {
      console.log(`[sandbox-service] Sandbox ${sandboxId} not found in registry`);
      return res.status(404).json({ error: 'Sandbox not found' });
    }
    
    // Update last accessed time
    sandbox.lastAccessed = new Date();
    
    const sandboxPath = `/app/sandboxes/${sandboxId}`;
    
    // Get all files recursively
    const files = await getFilesRecursively(sandboxPath, sandboxPath);
    const manifest = generateFileManifest(files);
    
    console.log(`[sandbox-service] Retrieved ${Object.keys(files).length} files from ${sandboxId}`);
    
    res.json({
      success: true,
      files,
      manifest,
      sandboxId
    });
    
  } catch (error) {
    console.error(`[sandbox-service] Error getting files for ${req.params.sandboxId}:`, error);
    res.status(500).json({ error: 'Failed to get sandbox files' });
  }
});

// Create and download a zip of the sandbox
app.post('/api/sandbox/:sandboxId/create-zip', async (req, res) => {
  try {
    const { sandboxId } = req.params;
    console.log(`[sandbox-service] Create zip endpoint hit for ${sandboxId}`);
    
    const sandbox = activeSandboxes.get(sandboxId);
    if (!sandbox) {
      console.log(`[sandbox-service] Sandbox ${sandboxId} not found in registry`);
      return res.status(404).json({ error: 'Sandbox not found' });
    }
    
    // Update last accessed time
    sandbox.lastAccessed = new Date();
    
    const sandboxPath = `/app/sandboxes/${sandboxId}`;
    const zipPath = `/tmp/${sandboxId}.zip`;
    
    // Use system zip command to create the archive
    // Exclude node_modules, .git, .next, dist, and other build artifacts
    const zipCommand = `cd "${sandboxPath}" && zip -r "${zipPath}" . -x "node_modules/*" ".git/*" ".next/*" "dist/*" ".cache/*" "*.log"`;
    
    console.log(`[sandbox-service] Creating zip for ${sandboxId}...`);
    
    await execAsync(zipCommand, { timeout: 30000 });
    
    // Read the zip file
    const zipBuffer = await fs.readFile(zipPath);
    
    // Convert to base64
    const base64Content = zipBuffer.toString('base64');
    
    // Clean up the temporary zip file
    try {
      await fs.unlink(zipPath);
    } catch (cleanupError) {
      console.warn(`[sandbox-service] Failed to cleanup temp file for ${sandboxId}:`, cleanupError);
    }
    
    console.log(`[sandbox-service] Zip created successfully for ${sandboxId}, size: ${zipBuffer.length} bytes`);
    
    res.json({
      success: true,
      filename: `${sandboxId}.zip`,
      content: base64Content,
      size: zipBuffer.length
    });
    
  } catch (error) {
    console.error(`[sandbox-service] Error creating zip for ${req.params.sandboxId}:`, error);
    res.status(500).json({ error: 'Failed to create zip' });
  }
});

// Root sandbox access (serves index.html)
app.get('/api/sandbox/:sandboxId/', async (req, res) => {
  try {
    const { sandboxId } = req.params;
    console.log(`[sandbox-service] Root sandbox access for ${sandboxId} - STARTING HTML PROCESSING`);
    
    const sandbox = activeSandboxes.get(sandboxId);
    if (!sandbox) {
      return res.status(404).send('Sandbox not found');
    }
    
    // Update last accessed
    sandbox.lastAccessed = new Date();
    
    // Serve index.html
    const targetPath = path.join(sandbox.buildPath, 'index.html');
    
    try {
      const content = await fs.readFile(targetPath);
      const baseHref = `/api/sandbox/${sandboxId}/`;
      
      let html = content.toString();
      if (html.includes('<head>')) {
        html = html.replace('<head>', `<head>\n  <base href="${baseHref}">`);
      }
      
      // Convert absolute asset paths to relative so they work with base href
      console.log(`[sandbox-service] Original HTML contains /assets/: ${html.includes('/assets/')}`);
      html = html.replace(/src="\/assets\//g, 'src="assets/');
      html = html.replace(/href="\/assets\//g, 'href="assets/');
      console.log(`[sandbox-service] After replacement, HTML contains /assets/: ${html.includes('/assets/')}`);
      
      res.setHeader('Content-Type', 'text/html');
      res.setHeader('Cache-Control', 'no-cache');
      res.send(html);
    } catch (error) {
      console.error(`[sandbox-service] Error serving index.html for ${sandboxId}:`, error);
      res.status(404).send('Index file not found');
    }
    
  } catch (error) {
    console.error(`[sandbox-service] Error serving sandbox root:`, error);
    res.status(500).send('Internal server error');
  }
});

// Serve sandbox asset files
app.get('/api/sandbox/:sandboxId/assets/*', async (req, res) => {
  try {
    const { sandboxId } = req.params;
    const filePath = `assets/${req.params[0]}`;
    console.log(`[sandbox-service] Asset request for ${sandboxId}, file: ${filePath}`);
    
    const sandbox = activeSandboxes.get(sandboxId);
    if (!sandbox) {
      return res.status(404).send('Sandbox not found');
    }
    
    // Update last accessed
    sandbox.lastAccessed = new Date();
    
    // Serve asset from dist directory
    const targetPath = path.join(sandbox.buildPath, filePath);
    
    try {
      const content = await fs.readFile(targetPath);
      const contentType = getContentType(filePath);
      
      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=300');
      res.send(content);
    } catch (error) {
      console.error(`[sandbox-service] Asset not found: ${filePath}`, error);
      res.status(404).send('Asset not found');
    }
    
  } catch (error) {
    console.error(`[sandbox-service] Error serving asset:`, error);
    res.status(500).send('Internal server error');
  }
});

// List all sandboxes
app.get('/api/sandboxes', (req, res) => {
  const sandboxList = Array.from(activeSandboxes.values()).map(sandbox => ({
    sandboxId: sandbox.sandboxId,
    sourceUrl: sandbox.sourceUrl,
    created: sandbox.created,
    lastAccessed: sandbox.lastAccessed
  }));
  
  res.json({
    sandboxes: sandboxList,
    total: sandboxList.length
  });
});


// Delete sandbox
app.delete('/api/sandbox/:sandboxId', async (req, res) => {
  try {
    const { sandboxId } = req.params;
    
    const sandbox = activeSandboxes.get(sandboxId);
    if (!sandbox) {
      return res.status(404).json({ error: 'Sandbox not found' });
    }
    
    // Remove from filesystem
    await fs.rm(sandbox.sandboxPath, { recursive: true, force: true });
    
    // Remove from registry
    activeSandboxes.delete(sandboxId);
    
    console.log(`[sandbox-service] Deleted sandbox ${sandboxId}`);
    
    res.json({
      success: true,
      message: 'Sandbox deleted successfully'
    });
    
  } catch (error) {
    console.error(`[sandbox-service] Error deleting sandbox:`, error);
    res.status(500).json({
      error: error.message
    });
  }
});

// Utility function
function getContentType(fileName) {
  const ext = path.extname(fileName).toLowerCase();
  
  const types = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.jsx': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.map': 'application/json'
  };
  
  return types[ext] || 'application/octet-stream';
}

// Static file serving removed - files served via API routes instead

// Cleanup old sandboxes (run every hour) with proper error handling
async function cleanupOldSandboxes() {
  try {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours
    const toDelete = [];
    
    for (const [sandboxId, sandbox] of activeSandboxes.entries()) {
      if (sandbox.lastAccessed < cutoff) {
        toDelete.push(sandboxId);
      }
    }
    
    if (toDelete.length === 0) {
      return; // Nothing to clean up
    }
    
    console.log(`[sandbox-service] Starting cleanup of ${toDelete.length} old sandboxes...`);
    
    for (const sandboxId of toDelete) {
      try {
        const sandbox = activeSandboxes.get(sandboxId);
        if (sandbox) {
          await fs.rm(sandbox.sandboxPath, { recursive: true, force: true });
          activeSandboxes.delete(sandboxId);
          console.log(`[sandbox-service] Cleaned up old sandbox: ${sandboxId}`);
        }
      } catch (error) {
        console.error(`[sandbox-service] Error cleaning up sandbox ${sandboxId}:`, error.message);
        // Continue with other sandboxes even if one fails
      }
    }
    
    console.log(`[sandbox-service] Cleanup completed: ${toDelete.length} sandboxes processed`);
  } catch (error) {
    console.error('[sandbox-service] Error during cleanup process:', error.message);
  }
}

// Schedule cleanup every hour, but wrap it to prevent crashes
setInterval(() => {
  cleanupOldSandboxes().catch(error => {
    console.error('[sandbox-service] Cleanup interval error:', error.message);
  });
}, 60 * 60 * 1000); // Every hour

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[sandbox-service] Server running on port ${PORT}`);
  console.log(`[sandbox-service] Health check: http://localhost:${PORT}/health`);
  
  // Load existing sandboxes from disk (run after server starts)
  console.log('[sandbox-service] About to call loadExistingSandboxes...');
  setImmediate(async () => {
    console.log('[sandbox-service] setImmediate callback executing...');
    try {
      await loadExistingSandboxes();
    } catch (error) {
      console.error('[sandbox-service] Failed to load existing sandboxes:', error.message);
      console.error('[sandbox-service] Error stack:', error.stack);
    }
  });
});
import { NextResponse } from 'next/server';
import { spawn, exec } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import { promisify } from 'util';
import type { SandboxState } from '@/types/sandbox';
import { appConfig } from '@/config/app.config';

const execAsync = promisify(exec);

// Store active sandbox info globally
declare global {
  var activeSandbox: any;
  var sandboxData: any;
  var existingFiles: Set<string>;
  var sandboxState: SandboxState;
}

// Generate a unique sandbox ID
function generateSandboxId(): string {
  return `sandbox_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

export async function POST() {
  try {
    console.log('[create-local-sandbox] Creating local folder sandbox...');
    
    // Kill existing processes if any
    if (global.activeSandbox?.viteProcess) {
      console.log('[create-local-sandbox] Killing existing Vite process...');
      try {
        global.activeSandbox.viteProcess.kill('SIGTERM');
      } catch (e) {
        console.error('Failed to kill existing Vite process:', e);
      }
      global.activeSandbox = null;
    }
    
    // Clear existing files tracking
    if (global.existingFiles) {
      global.existingFiles.clear();
    } else {
      global.existingFiles = new Set<string>();
    }

    // Create unique sandbox directory
    const sandboxId = generateSandboxId();
    const sandboxPath = path.join(process.cwd(), appConfig.sandbox.baseDir, sandboxId);
    
    console.log(`[create-local-sandbox] Creating sandbox directory: ${sandboxPath}`);
    await fs.mkdir(sandboxPath, { recursive: true });
    await fs.mkdir(path.join(sandboxPath, 'src'), { recursive: true });

    // Create package.json
    const packageJson = {
      name: "sandbox-app",
      version: "1.0.0",
      type: "module",
      scripts: {
        dev: `vite --host 0.0.0.0 --port ${appConfig.sandbox.vitePort}`,
        build: "vite build",
        preview: "vite preview"
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
    port: ${appConfig.sandbox.vitePort},
    strictPort: true,
    hmr: {
      port: 24678
    }
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
        <p className="text-lg text-gray-400">
          Local Sandbox Ready<br/>
          Start building your React app with Vite and Tailwind CSS!
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

    console.log('[create-local-sandbox] Installing dependencies...');
    
    // Install dependencies
    try {
      await execAsync('npm install', { 
        cwd: sandboxPath,
        timeout: 60000 // 1 minute timeout
      });
      console.log('[create-local-sandbox] Dependencies installed successfully');
    } catch (error) {
      console.warn('[create-local-sandbox] npm install had issues:', error);
      // Continue anyway as it might still work
    }

    console.log('[create-local-sandbox] Starting Vite dev server...');
    
    // Start Vite dev server
    const viteProcess = spawn('npm', ['run', 'dev'], {
      cwd: sandboxPath,
      stdio: ['inherit', 'pipe', 'pipe'],
      env: { ...process.env, FORCE_COLOR: '0' }
    });

    // Wait for Vite to start
    await new Promise((resolve) => {
      const timeout = setTimeout(resolve, appConfig.sandbox.viteStartupDelay);
      
      viteProcess.stdout?.on('data', (data) => {
        const output = data.toString();
        console.log('[vite]', output);
        if (output.includes('Local:') || output.includes('ready')) {
          clearTimeout(timeout);
          resolve(undefined);
        }
      });
      
      viteProcess.stderr?.on('data', (data) => {
        console.error('[vite error]', data.toString());
      });
    });

    // Store sandbox info globally
    const sandboxUrl = `http://localhost:${appConfig.sandbox.vitePort}`;
    
    global.activeSandbox = {
      viteProcess,
      sandboxPath,
      sandboxId
    };
    
    global.sandboxData = {
      sandboxId,
      url: sandboxUrl,
      id: sandboxId
    };
    
    // Initialize sandbox state
    global.sandboxState = {
      fileCache: {
        files: {},
        lastSync: Date.now(),
        sandboxId
      },
      sandbox: global.activeSandbox,
      sandboxData: global.sandboxData
    };
    
    // Track initial files
    global.existingFiles.add('src/App.jsx');
    global.existingFiles.add('src/main.jsx');
    global.existingFiles.add('src/index.css');
    global.existingFiles.add('index.html');
    global.existingFiles.add('package.json');
    global.existingFiles.add('vite.config.js');
    global.existingFiles.add('tailwind.config.js');
    global.existingFiles.add('postcss.config.js');
    
    console.log('[create-local-sandbox] Local sandbox ready at:', sandboxUrl);
    
    return NextResponse.json({
      success: true,
      sandboxId,
      url: sandboxUrl,
      message: 'Local sandbox created and Vite React app initialized'
    });

  } catch (error) {
    console.error('[create-local-sandbox] Error:', error);
    
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Failed to create local sandbox',
        details: error instanceof Error ? error.stack : undefined
      },
      { status: 500 }
    );
  }
}
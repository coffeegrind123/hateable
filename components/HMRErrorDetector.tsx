import { useEffect, useRef } from 'react';

interface HMRErrorDetectorProps {
  iframeRef: React.RefObject<HTMLIFrameElement>;
  onErrorDetected: (errors: Array<{ type: string; message: string; package?: string }>) => void;
  sandboxId?: string;
  autoFixEnabled?: boolean;
}

export default function HMRErrorDetector({ iframeRef, onErrorDetected, sandboxId, autoFixEnabled = true }: HMRErrorDetectorProps) {
  const checkIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const checkForHMRErrors = () => {
      if (!iframeRef.current) return;

      try {
        const iframeDoc = iframeRef.current.contentDocument;
        if (!iframeDoc) return;

        // Check for Vite error overlay
        const errorOverlay = iframeDoc.querySelector('vite-error-overlay');
        if (errorOverlay) {
          // Try to extract error message
          const messageElement = errorOverlay.shadowRoot?.querySelector('.message-body');
          if (messageElement) {
            const errorText = messageElement.textContent || '';
            
            // Parse import errors
            const importMatch = errorText.match(/Failed to resolve import "([^"]+)" from "([^"]+)"/);
            if (importMatch) {
              const [, importPath, fromFile] = importMatch;
              
              if (importPath.startsWith('.')) {
                // This is a local/component import
                console.log('[HMRErrorDetector] Detected missing component:', importPath, 'from', fromFile);
                
                // Attempt auto-fix if enabled
                if (autoFixEnabled && sandboxId) {
                  autoFixMissingComponent(sandboxId, importPath, fromFile, errorText);
                }
                
                onErrorDetected([{
                  type: 'component-missing',
                  message: `Missing component: ${importPath}`,
                  package: importPath
                }]);
              } else {
                // This is an npm package import
                let finalPackage = importPath;
                if (importPath.startsWith('@')) {
                  const parts = importPath.split('/');
                  finalPackage = parts.length >= 2 ? parts.slice(0, 2).join('/') : importPath;
                } else {
                  finalPackage = importPath.split('/')[0];
                }

                onErrorDetected([{
                  type: 'npm-missing',
                  message: `Failed to resolve import "${importPath}"`,
                  package: finalPackage
                }]);
              }
            }
            
            // Parse other common errors
            const syntaxMatch = errorText.match(/SyntaxError|Unexpected token/);
            if (syntaxMatch && autoFixEnabled && sandboxId) {
              console.log('[HMRErrorDetector] Detected syntax error, attempting auto-fix');
              autoFixSyntaxError(sandboxId, errorText);
            }
          }
        }
      } catch (_error) {
        // Cross-origin errors are expected, ignore them
      }
    };

    // Check immediately and then every 2 seconds
    checkForHMRErrors();
    checkIntervalRef.current = setInterval(checkForHMRErrors, 2000);

    return () => {
      if (checkIntervalRef.current) {
        clearInterval(checkIntervalRef.current);
      }
    };
  }, [iframeRef, onErrorDetected]);

  return null;
}

// Auto-fix functions
async function autoFixMissingComponent(sandboxId: string, importPath: string, fromFile: string, errorText: string) {
  try {
    console.log('[HMRErrorDetector] Attempting to auto-fix missing component:', importPath);
    
    const response = await fetch('/api/auto-fix-errors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sandboxId,
        error: {
          message: errorText,
          type: 'missing-import',
          importPath,
          fromFile
        }
      })
    });
    
    const result = await response.json();
    if (result.success) {
      console.log('[HMRErrorDetector] Auto-fix successful:', result.message);
      // The component should now reload automatically due to HMR
    } else {
      console.log('[HMRErrorDetector] Auto-fix failed:', result.error);
    }
  } catch (error) {
    console.error('[HMRErrorDetector] Auto-fix error:', error);
  }
}

async function autoFixSyntaxError(sandboxId: string, errorText: string) {
  try {
    console.log('[HMRErrorDetector] Attempting to auto-fix syntax error');
    
    const response = await fetch('/api/auto-fix-errors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sandboxId,
        error: {
          message: errorText,
          type: 'syntax-error'
        }
      })
    });
    
    const result = await response.json();
    if (result.success) {
      console.log('[HMRErrorDetector] Syntax auto-fix successful:', result.message);
    } else {
      console.log('[HMRErrorDetector] Syntax auto-fix failed:', result.error);
    }
  } catch (error) {
    console.error('[HMRErrorDetector] Syntax auto-fix error:', error);
  }
}
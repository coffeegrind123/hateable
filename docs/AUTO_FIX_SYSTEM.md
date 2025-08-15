# Automatic Error Detection and Resolution System

Open Hateable includes an intelligent system that automatically detects and fixes common development errors to improve the developer experience.

## Features

### 1. Enhanced AI Prompts
The AI code generation has been enhanced with strict validation rules:

- **Import Validation**: Before writing any file, the AI validates that all imports will be satisfied
- **Component Creation Validation**: For every import statement, the AI either uses an existing file OR creates the component in the same response
- **Self-Check Rules**: The AI counts imports vs files it's creating to ensure they match exactly

### 2. Automatic Error Detection
The system monitors Vite build errors in real-time and identifies:

- **Missing Component Errors**: When imports can't be resolved (e.g., `./components/NewsSection`)
- **Syntax Errors**: Common JSX/JavaScript syntax issues
- **Missing Asset Errors**: Missing CSS files or other assets

### 3. Automatic Resolution
When errors are detected, the system can automatically:

- **Create Missing Components**: Generate placeholder components with proper structure
- **Fix Syntax Issues**: Correct common syntax errors like `class=` → `className=`
- **Create Missing Assets**: Generate basic CSS files with proper Tailwind setup

## Configuration

### Enable/Disable Auto-Fix
In `config/app.config.ts`:

```typescript
dev: {
  // Automatic error fixing
  enableAutoFix: true,
  
  // Auto-fix delay (milliseconds) - wait before attempting fix
  autoFixDelay: 3000,
}
```

### Per-Component Configuration
When using the HMRErrorDetector component:

```typescript
<HMRErrorDetector 
  iframeRef={iframeRef}
  onErrorDetected={handleErrors}
  sandboxId={sandboxData?.sandboxId}
  autoFixEnabled={true} // Can be disabled per instance
/>
```

## How It Works

### 1. Error Detection Flow
1. **Vite Error Overlay**: Monitors for Vite error overlays in the sandbox iframe
2. **Pattern Matching**: Uses regex patterns to identify specific error types
3. **Classification**: Categorizes errors as component-missing, syntax-error, etc.
4. **Auto-Fix Trigger**: If auto-fix is enabled, attempts resolution

### 2. Component Creation Process
When a missing component is detected:

1. **Path Resolution**: Determines the full file path for the missing component
2. **Directory Creation**: Creates necessary directory structure
3. **Component Generation**: Creates a basic functional component with:
   - Proper React imports
   - Dark theme styling (matching Open Hateable theme)
   - Helpful placeholder content
   - Export statement

### 3. Generated Component Example
```jsx
import React from 'react';

const NewsSection = () => {
  return (
    <div className="p-6 bg-gray-800 text-gray-100">
      <h2 className="text-2xl font-bold mb-4">NewsSection</h2>
      <p className="text-gray-300">
        This component was automatically generated to fix a missing import error.
        Please customize it according to your needs.
      </p>
    </div>
  );
};

export default NewsSection;
```

## API Endpoints

### `/api/auto-fix-errors`
Handles automatic error resolution:

```typescript
POST /api/auto-fix-errors
{
  "sandboxId": "sandbox_123456789_abc",
  "error": {
    "message": "Failed to resolve import \"./components/NewsSection\"",
    "type": "missing-import",
    "importPath": "./components/NewsSection",
    "fromFile": "src/App.jsx"
  }
}
```

**Response:**
```typescript
{
  "success": true,
  "action": "created_component",
  "componentPath": "/path/to/NewsSection.jsx",
  "componentName": "NewsSection",
  "message": "Created missing component: NewsSection"
}
```

## Error Types Handled

### Missing Components
- **Pattern**: `Failed to resolve import "./components/Component" from "file.jsx"`
- **Action**: Creates basic React component
- **Files**: `.jsx` components in appropriate directories

### Syntax Errors
- **Pattern**: `SyntaxError` or `Unexpected token`
- **Actions**: 
  - `class=` → `className=`
  - `for=` → `htmlFor=`
  - Missing semicolons on imports/exports

### Missing Assets
- **Pattern**: `Cannot resolve module 'file.css'`
- **Action**: Creates basic CSS file with Tailwind setup

## Benefits

1. **Faster Development**: No more manual component creation for missing imports
2. **Reduced Errors**: Prevents common build failures from breaking the development flow
3. **Better UX**: Seamless experience when AI generates incomplete code
4. **Learning Tool**: Generated components serve as starting points for customization

## Best Practices

### For AI Prompt Enhancement
- The system works best when AI follows the enhanced validation rules
- Always generate complete component sets in a single response
- Count imports vs created files to ensure consistency

### For Manual Development
- Use auto-generated components as starting points, not final implementations
- Customize generated components to match your app's specific needs
- Review auto-fixes to ensure they align with your coding standards

### For Configuration
- Disable auto-fix in production environments
- Adjust `autoFixDelay` based on your development workflow
- Monitor auto-fix success rates and adjust patterns as needed

## Troubleshooting

### Auto-Fix Not Working
1. Check `dev.enableAutoFix` is `true` in config
2. Verify sandbox ID is being passed correctly
3. Check browser console for auto-fix logs
4. Ensure error patterns match expected formats

### Generated Components Issues
1. Check file permissions in sandbox directory
2. Verify component naming follows conventions
3. Ensure proper directory structure exists

### Performance Impact
- Auto-fix runs with a default 3-second delay
- Only processes errors, not successful builds
- Minimal overhead when no errors occur

This system makes Open Hateable more resilient and user-friendly by automatically handling common development errors that would otherwise interrupt the development flow.
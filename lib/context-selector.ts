import { FileManifest, EditIntent, EditType } from '@/types/file-manifest';
import { analyzeEditIntent } from '@/lib/edit-intent-analyzer';
import { getEditExamplesPrompt, getComponentPatternPrompt, getEditInstructions, getFileStructureOverviewPrompt } from '@/lib/prompt-loader';

export interface FileContext {
  primaryFiles: string[]; // Files to edit
  contextFiles: string[]; // Files to include for reference
  systemPrompt: string;   // Enhanced prompt with file info
  editIntent: EditIntent;
}

/**
 * Select files and build context based on user prompt
 */
export function selectFilesForEdit(
  userPrompt: string,
  manifest: FileManifest
): FileContext {
  // Analyze the edit intent
  const editIntent = analyzeEditIntent(userPrompt, manifest);
  
  // Get the files based on intent - only edit target files, but provide all others as context
  const primaryFiles = editIntent.targetFiles;
  const allFiles = Object.keys(manifest.files);
  let contextFiles = allFiles.filter(file => !primaryFiles.includes(file));
  
  // ALWAYS include key files in context if they exist and aren't already primary files
  const keyFiles: string[] = [];
  
  // App.jsx is most important - shows component structure
  const appFile = allFiles.find(f => f.endsWith('App.jsx') || f.endsWith('App.tsx'));
  if (appFile && !primaryFiles.includes(appFile)) {
    keyFiles.push(appFile);
  }
  
  // Include design system files for style context
  const tailwindConfig = allFiles.find(f => f.endsWith('tailwind.config.js') || f.endsWith('tailwind.config.ts'));
  if (tailwindConfig && !primaryFiles.includes(tailwindConfig)) {
    keyFiles.push(tailwindConfig);
  }
  
  const indexCss = allFiles.find(f => f.endsWith('index.css') || f.endsWith('globals.css'));
  if (indexCss && !primaryFiles.includes(indexCss)) {
    keyFiles.push(indexCss);
  }
  
  // Include package.json to understand dependencies
  const packageJson = allFiles.find(f => f.endsWith('package.json'));
  if (packageJson && !primaryFiles.includes(packageJson)) {
    keyFiles.push(packageJson);
  }
  
  // Put key files at the beginning of context for visibility
  contextFiles = [...keyFiles, ...contextFiles.filter(f => !keyFiles.includes(f))];
  
  // Build enhanced system prompt
  const systemPrompt = buildSystemPrompt(
    userPrompt,
    editIntent,
    primaryFiles,
    contextFiles,
    manifest
  );
  
  return {
    primaryFiles,
    contextFiles,
    systemPrompt,
    editIntent,
  };
}

/**
 * Build an enhanced system prompt with file structure context
 */
function buildSystemPrompt(
  userPrompt: string,
  editIntent: EditIntent,
  primaryFiles: string[],
  contextFiles: string[],
  manifest: FileManifest
): string {
  const sections: string[] = [];
  
  // Add edit examples first for better understanding
  if (editIntent.type !== EditType.FULL_REBUILD) {
    sections.push(getEditExamplesPrompt());
  }
  
  // Add edit intent section
  sections.push(`## Edit Intent
Type: ${editIntent.type}
Description: ${editIntent.description}
Confidence: ${(editIntent.confidence * 100).toFixed(0)}%

User Request: "${userPrompt}"`);
  
  // Add file structure overview
  sections.push(buildFileStructureSection(manifest));
  
  // Add component patterns
  const fileList = Object.keys(manifest.files).map(f => f.replace('/home/user/app/', '')).join('\n');
  sections.push(getComponentPatternPrompt(fileList));
  
  // Add primary files section
  if (primaryFiles.length > 0) {
    sections.push(`## Files to Edit
${primaryFiles.map(f => {
  const fileInfo = manifest.files[f];
  return `- ${f}${fileInfo?.componentInfo ? ` (${fileInfo.componentInfo.name} component)` : ''}`;
}).join('\n')}`);
  }
  
  // Add context files section
  if (contextFiles.length > 0) {
    sections.push(`## Context Files (for reference only)
${contextFiles.map(f => {
  const fileInfo = manifest.files[f];
  return `- ${f}${fileInfo?.componentInfo ? ` (${fileInfo.componentInfo.name} component)` : ''}`;
}).join('\n')}`);
  }
  
  // Add specific instructions based on edit type
  sections.push(buildEditInstructions(editIntent.type));
  
  // Add component relationships if relevant
  if (editIntent.type === EditType.UPDATE_COMPONENT || 
      editIntent.type === EditType.ADD_FEATURE) {
    sections.push(buildComponentRelationships(primaryFiles, manifest));
  }
  
  return sections.join('\n\n');
}

/**
 * Build file structure overview section
 */
function buildFileStructureSection(manifest: FileManifest): string {
  const allFiles = Object.entries(manifest.files)
    .map(([path]) => path.replace('/home/user/app/', ''))
    .filter(path => !path.includes('node_modules'))
    .sort();
  
  const componentFiles = Object.entries(manifest.files)
    .filter(([, info]) => info.type === 'component' || info.type === 'page')
    .map(([path, info]) => ({
      path: path.replace('/home/user/app/', ''),
      name: info.componentInfo?.name || path.split('/').pop(),
      type: info.type,
    }));
  
  return getFileStructureOverviewPrompt(
    allFiles,
    componentFiles,
    manifest.entryPoint,
    manifest.routes
  );
}

/**
 * Build edit-type specific instructions
 */
function buildEditInstructions(editType: EditType): string {
  return getEditInstructions(editType);
}

/**
 * Build component relationship information
 */
function buildComponentRelationships(
  files: string[],
  manifest: FileManifest
): string {
  const relationships: string[] = ['## Component Relationships'];
  
  for (const file of files) {
    const fileInfo = manifest.files[file];
    if (!fileInfo?.componentInfo) continue;
    
    const componentName = fileInfo.componentInfo.name;
    const treeNode = manifest.componentTree[componentName];
    
    if (treeNode) {
      relationships.push(`\n### ${componentName}`);
      
      if (treeNode.imports.length > 0) {
        relationships.push(`Imports: ${treeNode.imports.join(', ')}`);
      }
      
      if (treeNode.importedBy.length > 0) {
        relationships.push(`Used by: ${treeNode.importedBy.join(', ')}`);
      }
      
      if (fileInfo.componentInfo.childComponents?.length) {
        relationships.push(`Renders: ${fileInfo.componentInfo.childComponents.join(', ')}`);
      }
    }
  }
  
  return relationships.join('\n');
}

/**
 * Get file content for selected files
 */
export async function getFileContents(
  files: string[],
  manifest: FileManifest
): Promise<Record<string, string>> {
  const contents: Record<string, string> = {};
  
  for (const file of files) {
    const fileInfo = manifest.files[file];
    if (fileInfo) {
      contents[file] = fileInfo.content;
    }
  }
  
  return contents;
}

/**
 * Format files for AI context
 */
export function formatFilesForAI(
  primaryFiles: Record<string, string>,
  contextFiles: Record<string, string>
): string {
  const sections: string[] = [];
  
  // Add primary files
  sections.push('## Files to Edit (ONLY OUTPUT THESE FILES)\n');
  sections.push('🚨 You MUST ONLY generate the files listed below. Do NOT generate any other files! 🚨\n');
  sections.push('⚠️ CRITICAL: Return the COMPLETE file - NEVER truncate with "..." or skip any lines! ⚠️\n');
  sections.push('The file MUST include ALL imports, ALL functions, ALL JSX, and ALL closing tags.\n\n');
  for (const [path, content] of Object.entries(primaryFiles)) {
    sections.push(`### ${path}
**IMPORTANT: This is the COMPLETE file. Your output must include EVERY line shown below, modified only where necessary.**
\`\`\`${getFileExtension(path)}
${content}
\`\`\`
`);
  }
  
  // Add context files if any - but truncate large files
  if (Object.keys(contextFiles).length > 0) {
    sections.push('\n## Context Files (Reference Only - Do Not Edit)\n');
    for (const [path, content] of Object.entries(contextFiles)) {
      // Truncate very large context files to save tokens
      let truncatedContent = content;
      if (content.length > 2000) {
        truncatedContent = content.substring(0, 2000) + '\n// ... [truncated for context length]';
      }
      
      sections.push(`### ${path}
\`\`\`${getFileExtension(path)}
${truncatedContent}
\`\`\`
`);
    }
  }
  
  return sections.join('\n');
}

/**
 * Get file extension for syntax highlighting
 */
function getFileExtension(path: string): string {
  const ext = path.split('.').pop() || '';
  const mapping: Record<string, string> = {
    'js': 'javascript',
    'jsx': 'javascript',
    'ts': 'typescript',
    'tsx': 'typescript',
    'css': 'css',
    'json': 'json',
  };
  return mapping[ext] || ext;
}
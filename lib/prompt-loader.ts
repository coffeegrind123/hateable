import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Prompt loader utility for loading prompt templates from markdown files
 */

export enum PromptType {
  MAIN_SYSTEM = 'main-system-prompt',
  EDIT_MODE = 'edit-mode-prompt',
  TARGETED_EDIT = 'targeted-edit-prompt',
  EDIT_EXAMPLES = 'edit-examples',
  EDIT_INTENT_ANALYSIS = 'edit-intent-analysis-prompt',
  SURGICAL_EDIT = 'surgical-edit-instructions',
  ADD_FEATURE = 'add-feature-instructions',
  FIX_ISSUE = 'fix-issue-instructions',
  SURGICAL_STYLE_EDIT = 'surgical-style-edit-instructions',
  REFACTOR = 'refactor-instructions',
  FULL_REBUILD = 'full-rebuild-instructions',
  ADD_DEPENDENCY = 'add-dependency-instructions',
  COMPONENT_PATTERN = 'component-pattern-prompt',
  FILE_STRUCTURE_OVERVIEW = 'file-structure-overview-template'
}

/**
 * Cache for loaded prompts to avoid reading files multiple times
 */
const promptCache = new Map<string, string>();

/**
 * Load a prompt from a markdown file
 */
export function loadPrompt(promptType: PromptType): string {
  // Check cache first
  if (promptCache.has(promptType)) {
    return promptCache.get(promptType)!;
  }

  try {
    const promptPath = join(process.cwd(), 'docs', 'tools', `${promptType}.md`);
    const content = readFileSync(promptPath, 'utf-8');
    
    // Cache the content
    promptCache.set(promptType, content);
    
    return content;
  } catch (error) {
    console.error(`Failed to load prompt ${promptType}:`, error);
    throw new Error(`Failed to load prompt: ${promptType}`);
  }
}

/**
 * Load multiple prompts at once
 */
export function loadPrompts(promptTypes: PromptType[]): Record<string, string> {
  const prompts: Record<string, string> = {};
  
  for (const promptType of promptTypes) {
    prompts[promptType] = loadPrompt(promptType);
  }
  
  return prompts;
}

/**
 * Clear the prompt cache (useful for development/testing)
 */
export function clearPromptCache(): void {
  promptCache.clear();
}

/**
 * Preload all prompts into cache
 */
export function preloadAllPrompts(): void {
  const allPromptTypes = Object.values(PromptType);
  for (const promptType of allPromptTypes) {
    try {
      loadPrompt(promptType);
    } catch (error) {
      console.warn(`Failed to preload prompt ${promptType}:`, error);
    }
  }
  console.log(`Preloaded ${promptCache.size} prompts into cache`);
}

/**
 * Build a complete system prompt with conversational context
 */
export function buildSystemPrompt(
  conversationContext: string,
  isEdit?: boolean,
  editContext?: any
): string {
  let systemPrompt = loadPrompt(PromptType.MAIN_SYSTEM);
  
  // Add conversation context at the beginning
  systemPrompt = systemPrompt.replace(
    'You are an expert React developer',
    `You are an expert React developer${conversationContext}\n\nYou are an expert React developer`
  );
  
  // Add edit mode prompts if this is an edit
  if (isEdit) {
    systemPrompt += '\n\n' + loadPrompt(PromptType.EDIT_MODE);
    
    // Add targeted edit mode if we have edit context
    if (editContext) {
      const targetedEditPrompt = loadPrompt(PromptType.TARGETED_EDIT);
      systemPrompt += '\n\n' + targetedEditPrompt
        .replace('- Edit Type: ${editContext.editIntent.type}', `- Edit Type: ${editContext.editIntent.type}`)
        .replace('- Confidence: ${editContext.editIntent.confidence}', `- Confidence: ${editContext.editIntent.confidence}`)
        .replace('- Files to Edit: ${editContext.primaryFiles.join(\', \')}', `- Files to Edit: ${editContext.primaryFiles.join(', ')}`);
    }
  }
  
  return systemPrompt;
}

/**
 * Get edit instructions for a specific edit type
 */
export function getEditInstructions(editType: string): string {
  const editTypeMap: Record<string, PromptType> = {
    'UPDATE_COMPONENT': PromptType.SURGICAL_EDIT,
    'ADD_FEATURE': PromptType.ADD_FEATURE,
    'FIX_ISSUE': PromptType.FIX_ISSUE,
    'UPDATE_STYLE': PromptType.SURGICAL_STYLE_EDIT,
    'REFACTOR': PromptType.REFACTOR,
    'FULL_REBUILD': PromptType.FULL_REBUILD,
    'ADD_DEPENDENCY': PromptType.ADD_DEPENDENCY,
  };
  
  const promptType = editTypeMap[editType] || PromptType.SURGICAL_EDIT;
  return loadPrompt(promptType);
}

/**
 * Get edit examples prompt
 */
export function getEditExamplesPrompt(): string {
  return loadPrompt(PromptType.EDIT_EXAMPLES);
}

/**
 * Get component pattern prompt with file structure
 */
export function getComponentPatternPrompt(fileStructure: string): string {
  const template = loadPrompt(PromptType.COMPONENT_PATTERN);
  return `## Current Project Structure\n\n${fileStructure}\n\n${template}`;
}

/**
 * Get file structure overview prompt
 */
export function getFileStructureOverviewPrompt(
  allFiles: string[],
  componentFiles: Array<{ path: string; name: string; type: string }>,
  entryPoint: string,
  routes: Array<{ path: string; component: string }>
): string {
  const template = loadPrompt(PromptType.FILE_STRUCTURE_OVERVIEW);
  
  return `## 🚨 EXISTING PROJECT FILES - DO NOT CREATE NEW FILES WITH SIMILAR NAMES 🚨

### ALL PROJECT FILES (${allFiles.length} files)
\`\`\`
${allFiles.join('\n')}
\`\`\`

### Component Files (USE THESE EXACT NAMES)
${componentFiles.map(f => 
  `- ${f.name} → ${f.path} (${f.type})`
).join('\n')}

${template}

Entry Point: ${entryPoint}

### Routes
${routes.map(r => 
  `- ${r.path} → ${r.component.split('/').pop()}`
).join('\n') || 'No routes detected'}`;
}
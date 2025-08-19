/**
 * Example-based prompts for teaching AI proper edit behavior
 * 
 * This module now loads prompts from external markdown files
 * for easier maintenance and modification.
 */

import { loadPrompt, PromptType } from '@/lib/prompt-loader';

export function getEditExamplesPrompt(): string {
  return loadPrompt(PromptType.EDIT_EXAMPLES);
}

export function getComponentPatternPrompt(fileStructure: string): string {
  const template = loadPrompt(PromptType.COMPONENT_PATTERN);
  return `## Current Project Structure

${fileStructure}

${template}`;
}
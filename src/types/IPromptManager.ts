import { ClassificationResult } from './ContentClass';

/**
 * Interface for Prompt Management
 */

export interface IPromptManager {
  /**
   * Get the system prompt for processing, optionally enriched with domain examples
   * based on content classification results.
   */
  getSystemPrompt(
    inputDir: string,
    filter: string,
    description?: string,
    contentClasses?: ClassificationResult[]
  ): Promise<string>;

  /**
   * Set a custom system prompt
   */
  setCustomSystemPrompt(prompt: string): void;

  /**
   * Get prompt template by name
   */
  getTemplate(templateName: string): string;
}

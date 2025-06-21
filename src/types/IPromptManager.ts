/**
 * Interface for Prompt Management
 */

export interface IPromptManager {
  /**
   * Get the system prompt for processing
   */
  getSystemPrompt(inputDir: string, filter: string, description?: string): Promise<string>;

  /**
   * Set a custom system prompt
   */
  setCustomSystemPrompt(prompt: string): void;

  /**
   * Get prompt template by name
   */
  getTemplate(templateName: string): string;
}

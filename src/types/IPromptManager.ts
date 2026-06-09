import { ClassificationResult } from './ContentClass';
import { CorpusGlossary } from './CorpusProfile';

/**
 * Interface for Prompt Management
 */

export interface IPromptManager {
  /**
   * Get the system prompt for processing, optionally enriched with domain examples
   * based on content classification results and the corpus glossary (whose entity/
   * relation types become the closed vocabularies in the v5 system prompt).
   */
  getSystemPrompt(
    inputDir: string,
    filter: string,
    description?: string,
    contentClasses?: ClassificationResult[],
    glossary?: CorpusGlossary
  ): Promise<string>;

  /**
   * Render the glossary-generation prompts for the corpus pre-pass from the current
   * version's `glossary/{system,user}.hbs`, or undefined when the version ships none.
   */
  getGlossaryPrompt(
    vars: { classLine: string; termList: string; snippets: string }
  ): Promise<{ system: string; user: string } | undefined>;

  /**
   * Set a custom system prompt
   */
  setCustomSystemPrompt(prompt: string): void;

  /**
   * Get prompt template by name
   */
  getTemplate(templateName: string): string;
}

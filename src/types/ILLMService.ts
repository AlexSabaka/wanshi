/**
 * Interface for Language Model services
 */
export interface ILLMService {
  /**
   * Generate a response from the LLM
   */
  generate(prompt: string, systemPrompt?: string): Promise<string>;
  
  /**
   * Generate a JSON response from the LLM
   */
  generateJSON<T = any>(prompt: string, systemPrompt?: string): Promise<T>;
  
  /**
   * Check if the service is available
   */
  isAvailable(): Promise<boolean>;
  
  /**
   * Get model information
   */
  getModelInfo(): {
    model: string;
    host: string;
    temperature?: number;
    contextLength?: number;
  };
}

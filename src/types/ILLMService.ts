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

/**
 * Interface for Embedding services
 */
export interface IEmbeddingService {
  /**
   * Generate embeddings for text
   */
  embed(text: string): Promise<number[]>;
  
  /**
   * Generate embeddings for multiple texts
   */
  embedBatch(texts: string[]): Promise<number[][]>;
  
  /**
   * Calculate similarity between two texts
   */
  calculateSimilarity(text1: string, text2: string): Promise<number>;
  
  /**
   * Calculate similarity from embeddings
   */
  calculateSimilarityFromEmbeddings(embedding1: number[], embedding2: number[]): number;
}

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

/**
 * Configuration for LLM services
 */
export interface LLMConfig {
  model: string;
  host: string;
  temperature?: number;
  contextLength?: number;
  repeatPenalty?: number;
  seed?: number;
}

/**
 * Configuration for Embedding services
 */
export interface EmbeddingConfig {
  model: string;
  host: string;
}
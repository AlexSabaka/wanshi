import ollama from 'ollama';
import { logger } from '../../shared/logger';

export interface EmbeddingOptions {
  model: string;
  host: string;
}

/**
 * Service for generating text embeddings
 */
export class EmbeddingService {
  private options: EmbeddingOptions;
  private cache: Map<string, number[]>;

  constructor(options: EmbeddingOptions) {
    this.options = options;
    this.cache = new Map();
  }

  /**
   * Generate embeddings for a single text
   */
  async embed(text: string): Promise<number[]> {
    // Check cache first
    const cached = this.cache.get(text);
    if (cached) {
      logger.debug(`Using cached embedding for text: ${text.substring(0, 50)}...`);
      return cached;
    }

    logger.debug(`Generating embedding for text: ${text.substring(0, 50)}...`);
    
    try {
      const response = await ollama.embeddings({
        model: this.options.model,
        prompt: text,
      });

      // Cache the result
      this.cache.set(text, response.embedding);
      
      return response.embedding;
    } catch (error) {
      logger.error(`Failed to generate embedding: ${error}`);
      throw new Error(`Failed to generate embedding: ${error}`);
    }
  }

  /**
   * Generate embeddings for multiple texts
   */
  async embedBatch(texts: string[]): Promise<number[][]> {
    logger.debug(`Generating embeddings for ${texts.length} texts`);
    
    const embeddings: number[][] = [];
    
    // Process in batches to avoid overwhelming the model
    const batchSize = 10;
    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      const batchEmbeddings = await Promise.all(
        batch.map(text => this.embed(text))
      );
      embeddings.push(...batchEmbeddings);
    }

    return embeddings;
  }

  /**
   * Clear the embedding cache
   */
  clearCache(): void {
    this.cache.clear();
    logger.debug('Embedding cache cleared');
  }

  /**
   * Get cache size
   */
  getCacheSize(): number {
    return this.cache.size;
  }
}
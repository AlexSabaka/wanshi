import { Ollama } from 'ollama';
import { Logger } from '../../shared';
import { IEmbeddingProvider } from '../../types/IEmbeddingProvider';
import { MIN_EMBED_CHARS, DEFAULT_MAX_EMBED_CHARS, isContextLengthError } from './embeddingUtils';

export interface EmbeddingOptions {
  model: string;
  host: string;
  /** Hard cap on input length sent to the embedding model (chars). Prevents
   * "input length exceeds model maximum" failures. 0/undefined = no limit. */
  maxInputChars?: number;
}

/**
 * Service for generating text embeddings
 */
export class EmbeddingService implements IEmbeddingProvider {
  private options: EmbeddingOptions;
  private cache: Map<string, number[]>;
  private logger: Logger;
  private ollama: Ollama;

  constructor(options: EmbeddingOptions, logger: Logger) {
    this.options = { maxInputChars: DEFAULT_MAX_EMBED_CHARS, ...options };
    this.cache = new Map();
    this.logger = logger;
    this.ollama = new Ollama({ host: options.host });
  }

  /** Trim input to the configured char budget so long observations/entities
   * don't exceed the embedding model's context window. */
  private truncate(text: string): string {
    const max = this.options.maxInputChars;
    if (max && max > 0 && text.length > max) {
      this.logger.debug(
        `Truncating embedding input from ${text.length} to ${max} chars`
      );
      return text.slice(0, max);
    }
    return text;
  }

  /**
   * Generate embeddings for a single text
   */
  async embed(text: string): Promise<number[]> {
    // Check cache first
    const cached = this.cache.get(text);
    if (cached) {
      this.logger.debug(`Using cached embedding for text: ${text.substring(0, 50)}...`);
      return cached;
    }

    this.logger.debug(`Generating embedding for text: ${text.substring(0, 50)}...`);

    const embedding = await this.embedWithFallback(this.truncate(text));
    this.cache.set(text, embedding);
    return embedding;
  }

  /**
   * Embed `input`, halving it and retrying if the model rejects it for being
   * too long. The char cap can't know any given model's exact token limit, so
   * this self-corrects for dense content (JSON/code) on small-context models.
   */
  private async embedWithFallback(input: string): Promise<number[]> {
    let current = input;
    while (true) {
      try {
        const response = await this.ollama.embeddings({
          model: this.options.model,
          prompt: current,
        });
        return response.embedding;
      } catch (error) {
        if (isContextLengthError(error) && current.length > MIN_EMBED_CHARS) {
          const next = Math.max(MIN_EMBED_CHARS, Math.floor(current.length / 2));
          this.logger.warn(
            `Embedding input too long (${current.length} chars); retrying with ${next}`
          );
          current = current.slice(0, next);
          continue;
        }
        this.logger.error(`Failed to generate embedding: ${error}`);
        throw new Error(`Failed to generate embedding: ${error}`);
      }
    }
  }

  /**
   * Generate embeddings for multiple texts
   */
  async embedBatch(texts: string[]): Promise<number[][]> {
    this.logger.debug(`Generating embeddings for ${texts.length} texts`);
    
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
    this.logger.debug('Embedding cache cleared');
  }

  /**
   * Get cache size
   */
  getCacheSize(): number {
    return this.cache.size;
  }
}
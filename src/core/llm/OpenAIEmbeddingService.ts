import OpenAI from "openai";
import { Logger } from "../../shared";
import { IEmbeddingProvider } from "../../types/IEmbeddingProvider";
import { MIN_EMBED_CHARS, DEFAULT_MAX_EMBED_CHARS, isContextLengthError } from "./embeddingUtils";

export interface OpenAIEmbeddingOptions {
  model: string;
  host: string; // base URL, e.g. https://api.openai.com/v1
  apiKey?: string;
  /** Hard cap on input length sent to the embedding model (chars). 0/undefined = no limit. */
  maxInputChars?: number;
}

/**
 * Embedding provider for any OpenAI-compatible embeddings endpoint.
 * Mirrors EmbeddingService (same in-memory cache contract) but batches
 * natively via the array `input` form to cut request count on metered APIs.
 */
export class OpenAIEmbeddingService implements IEmbeddingProvider {
  private options: OpenAIEmbeddingOptions;
  private cache: Map<string, number[]>;
  private logger: Logger;
  private client: OpenAI;

  constructor(options: OpenAIEmbeddingOptions, logger: Logger) {
    this.options = { maxInputChars: DEFAULT_MAX_EMBED_CHARS, ...options };
    this.cache = new Map();
    this.logger = logger;
    this.client = new OpenAI({
      apiKey: options.apiKey || "not-needed",
      baseURL: options.host,
    });
  }

  /** Trim input to the configured char budget before embedding. */
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

  async embed(text: string): Promise<number[]> {
    const cached = this.cache.get(text);
    if (cached) return cached;

    const embedding = await this.embedWithFallback(this.truncate(text));
    this.cache.set(text, embedding);
    return embedding;
  }

  /** Embed one input, halving + retrying if the model rejects it as too long. */
  private async embedWithFallback(input: string): Promise<number[]> {
    let current = input;
    while (true) {
      try {
        const response = await this.client.embeddings.create({
          model: this.options.model,
          input: current,
        });
        return response.data[0].embedding;
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

  async embedBatch(texts: string[]): Promise<number[][]> {
    this.logger.debug(`Generating embeddings for ${texts.length} texts`);

    const results: number[][] = new Array(texts.length);
    const uncachedIndexes: number[] = [];

    texts.forEach((text, i) => {
      const cached = this.cache.get(text);
      if (cached) {
        results[i] = cached;
      } else {
        uncachedIndexes.push(i);
      }
    });

    const batchSize = 100;
    for (let i = 0; i < uncachedIndexes.length; i += batchSize) {
      const batchIndexes = uncachedIndexes.slice(i, i + batchSize);
      const batchInput = batchIndexes.map((idx) => this.truncate(texts[idx]));

      try {
        const response = await this.client.embeddings.create({
          model: this.options.model,
          input: batchInput,
        });

        response.data.forEach((item, j) => {
          const originalIndex = batchIndexes[j];
          this.cache.set(texts[originalIndex], item.embedding);
          results[originalIndex] = item.embedding;
        });
      } catch (error) {
        if (!isContextLengthError(error)) throw error;
        // A too-long item (or too-large request) — fall back to per-item embed,
        // which adaptively shrinks oversized inputs.
        this.logger.warn(
          `Batch embedding too long; falling back to per-item embedding for ${batchIndexes.length} items`
        );
        for (const idx of batchIndexes) {
          results[idx] = await this.embed(texts[idx]);
        }
      }
    }

    return results;
  }

  clearCache(): void {
    this.cache.clear();
    this.logger.debug("Embedding cache cleared");
  }

  getCacheSize(): number {
    return this.cache.size;
  }
}

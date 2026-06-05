/**
 * Provider-agnostic embedding backend used for observation dedup and context
 * retrieval. Implemented by EmbeddingService (local Ollama) and
 * OpenAIEmbeddingService (cloud). Kept separate from the richer IEmbeddingService
 * interface, which also declares similarity helpers not implemented here.
 */
export interface IEmbeddingProvider {
  embed(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
  clearCache(): void;
  getCacheSize(): number;
}

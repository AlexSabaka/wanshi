export interface MergeOptions {
  entitySimilarityThreshold: number; // 0-1, similarity threshold for entity name matching
  observationSimilarityThreshold: number; // 0-1, similarity threshold for observation deduplication
  model: string; // Ollama model for embeddings
  host: string; // Ollama host
}

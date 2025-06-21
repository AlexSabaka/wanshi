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

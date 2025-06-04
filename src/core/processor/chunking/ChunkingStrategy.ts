import { ProcessedChunk } from './TextChunker';

/**
 * Strategy interface for different chunking approaches
 */
export interface ChunkingStrategy {
  /**
   * Name of the chunking strategy
   */
  getName(): string;

  /**
   * Chunk content into smaller pieces
   */
  chunk(content: string, maxChunkSize: number, overlapSize: number): Promise<ProcessedChunk[]>;

  /**
   * Check if this strategy can handle the content type
   */
  canHandle(contentType: string): boolean;
}
/**
 * Represents a processed file with its content
 */
export interface ProcessedFile {
  path: string;
  chunks: ProcessedChunk[];
  /**
   * Full source text of the file, reconstructed from chunk offsets. Fed to the
   * document-outline generator and the grounding path; empty when unavailable.
   */
  content?: string;
  metadata?: Record<string, any>;
}

/**
 * Represents a chunk of processed content
 */
export interface ProcessedChunk {
  content: string;
  index: number;
  totalChunks: number;
  startOffset: number;
  endOffset: number;
  images?: ProcessedImage[];
  /**
   * Provenance the reader knows about this chunk (e.g. a transcript turn's
   * speaker and timestamp). Stamped deterministically onto every observation
   * extracted from the chunk by KnowledgeGraphBuilder.
   */
  provenance?: ChunkProvenance;
}

/**
 * Per-chunk provenance carried from the reader to the extracted observations.
 * `occurredAt` is valid-time (when it was said/true); the builder also stamps
 * `source` (file path) and transaction-time (`createdAt`) itself.
 */
export interface ChunkProvenance {
  speaker?: string;
  source?: string;
  occurredAt?: string; // ISO-8601; becomes the observation's validAt
}

/**
 * Represents a processed image
 */
export interface ProcessedImage {
  path: string;
  caption?: string;
  base64?: string;
}

/**
 * Options for text chunking
 */
export interface ChunkingOptions {
  maxChunkSize: number;
  overlapSize: number;
  enabled: boolean;
}


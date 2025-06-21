
/**
 * Represents a processed file with its content
 */
export interface ProcessedFile {
  path: string;
  chunks: ProcessedChunk[];
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


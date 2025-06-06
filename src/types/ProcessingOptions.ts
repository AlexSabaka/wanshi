/**
 * Configuration options for knowledge graph processing
 * Cleaned up to remove conflicting boolean pairs and improve clarity
 */
export interface ProcessingOptions {
  // Core Processing
  input: string;
  filter: string;
  output: string;
  description: string;

  // LLM Configuration
  model: string;
  host: string;
  temperature: number;
  repeatPenalty: number;
  contextLength: number;
  seed?: number;
  system: string;
  embeddingsModel: string;

  // Text Processing
  chunkSize: number;
  overlapSize: number;
  chunking: ChunkingMode;

  // Context Retrieval
  retrieval: RetrievalMode;
  retrievalLimit: number;

  // Knowledge Graph Merging
  entitySimilarityThreshold?: number;
  observationSimilarityThreshold?: number;
  enableSimilarityMerging?: boolean;

  // Export Options
  exportFormat?: 'json' | 'jsonl' | 'mcp-jsonl';

  // Logging & Debug
  logLevel: 'debug' | 'info' | 'warning' | 'error';
  logFile: string;
  debug: boolean;
  silent: boolean;

  // Runtime Modes
  watch: boolean;
}

/**
 * Chunking behavior options
 */
export type ChunkingMode = 'enabled' | 'disabled' | 'auto';

/**
 * Context retrieval behavior options
 */
export type RetrievalMode = 'enabled' | 'disabled' | 'auto';

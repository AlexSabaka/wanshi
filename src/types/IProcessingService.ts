import { KnowledgeGraph } from './KnowledgeGraph';
import { ProcessingOptions } from './ProcessingOptions';

/**
 * Represents a processed file with its content
 */
export interface ProcessedFile {
  path: string;
  content: string;
  chunks?: ProcessedChunk[];
  images?: ProcessedImage[];
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
 * Interface for File Processing services
 */
export interface IFileProcessor {
  /**
   * Process a single file
   */
  processFile(filePath: string, options: ChunkingOptions): Promise<ProcessedFile>;
  
  /**
   * Check if a file type is supported
   */
  canProcess(filePath: string): boolean;
}

/**
 * Options for text chunking
 */
export interface ChunkingOptions {
  maxChunkSize: number;
  overlapSize: number;
  enabled: boolean;
}

/**
 * Interface for Knowledge Graph Building services
 */
export interface IKnowledgeGraphBuilder {
  /**
   * Build knowledge graphs from processed file
   */
  build(
    file: ProcessedFile,
    systemPrompt: string,
    retrievalContext?: any
  ): Promise<KnowledgeGraph[]>;
}

/**
 * Interface for Knowledge Graph Search services
 */
export interface IKnowledgeGraphSearch {
  /**
   * Search by file content
   */
  searchByFileContent(
    content: string,
    filePath: string,
    existingGraphs: KnowledgeGraph[],
    options: SearchOptions
  ): Promise<any>;
  
  /**
   * Search by query
   */
  searchByQuery(
    query: string,
    knowledgeGraphs: KnowledgeGraph[],
    options: SearchOptions
  ): Promise<any>;
}

/**
 * Options for knowledge graph searching
 */
export interface SearchOptions {
  limit?: number;
  includeObservations?: boolean;
  minSimilarity?: number;
}

/**
 * Interface for Knowledge Graph Merging
 */
export interface IKnowledgeGraphMerger {
  /**
   * Merge multiple knowledge graphs into one
   */
  merge(
    graphs: KnowledgeGraph[],
    options: MergeOptions
  ): Promise<KnowledgeGraph>;
}

/**
 * Options for merging knowledge graphs
 */
export interface MergeOptions {
  entitySimilarityThreshold: number;
  observationSimilarityThreshold: number;
  model: string;
  host: string;
}

/**
 * Interface for Directory Processing
 */
export interface IDirectoryProcessor {
  /**
   * Process a directory and generate knowledge graphs
   */
  processDirectory(options: ProcessingOptions): Promise<void>;
}
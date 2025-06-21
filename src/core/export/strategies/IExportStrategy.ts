import { KnowledgeGraph } from "../../../types/KnowledgeGraph";
import { ProcessingOptions } from "../../../types/ProcessingOptions";

/**
 * Base interface for export strategies
 */
export interface IExportStrategy {
  /**
   * Export the knowledge graph to string format
   */
  export(graph: KnowledgeGraph, processingOptions?: ProcessingOptions): string;
  
  /**
   * Get the format identifier this strategy handles
   */
  getFormat(): string;
  
  /**
   * Check if this strategy supports the given format
   */
  supportsFormat(format: string): boolean;
}
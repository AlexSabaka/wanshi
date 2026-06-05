import { ExportFormat, KnowledgeGraph, ProcessingOptions } from '.';

/**
 * Interface for Knowledge Graph Export services
 */
export interface IKnowledgeGraphExporter {
  /**
   * Export knowledge graph to a specific format.
   * `processingOptions` is forwarded to format strategies (e.g. the DOT
   * strategy reads `dotOptions`, graph title, and processing-config cluster).
   */
  export(
    knowledgeGraph: KnowledgeGraph,
    format: ExportFormat,
    processingOptions?: ProcessingOptions
  ): string;
  
  /**
   * Check if a format is supported
   */
  isFormatSupported(format: string): boolean;
  
  /**
   * Get list of supported formats
   */
  getSupportedFormats(): ExportFormat[];
}

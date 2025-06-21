import { ExportFormat, KnowledgeGraph } from '.';

/**
 * Interface for Knowledge Graph Export services
 */
export interface IKnowledgeGraphExporter {
  /**
   * Export knowledge graph to a specific format
   */
  export(knowledgeGraph: KnowledgeGraph, format: ExportFormat): string;
  
  /**
   * Check if a format is supported
   */
  isFormatSupported(format: string): boolean;
  
  /**
   * Get list of supported formats
   */
  getSupportedFormats(): ExportFormat[];
}

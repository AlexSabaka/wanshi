import { ProcessedFile } from './IProcessingService';
import { KnowledgeGraph } from './KnowledgeGraph';

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

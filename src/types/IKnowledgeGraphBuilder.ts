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
    retrieve?: (chunkContent: string) => Promise<any>
  ): Promise<KnowledgeGraph[]>;
}

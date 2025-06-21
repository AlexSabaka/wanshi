import { KnowledgeGraph } from './KnowledgeGraph';

/**
 * Interface for Knowledge Graph Merging
 */

export interface IKnowledgeGraphMerger {
  /**
   * Merge multiple knowledge graphs into one
   */
  merge(
    graphs: KnowledgeGraph[]
  ): Promise<KnowledgeGraph>;
}

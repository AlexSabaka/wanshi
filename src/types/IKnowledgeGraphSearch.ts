import { KnowledgeGraph } from './KnowledgeGraph';

/**
 * Options for knowledge graph searching
 */
export interface SearchOptions {
  limit?: number;
  includeObservations?: boolean;
  minSimilarity?: number;
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
}

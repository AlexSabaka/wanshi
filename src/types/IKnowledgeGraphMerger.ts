import { KnowledgeGraph } from './KnowledgeGraph';

/**
 * Interface for Knowledge Graph Merging
 */

export interface IKnowledgeGraphMerger {
  /**
   * Merge multiple knowledge graphs into one.
   *
   * @param knownExternalEndpointNames Names of entities that live OUTSIDE this run's
   *   extracted set but are legitimate edge endpoints (prior-graph entities +
   *   corpus-glossary names fed to retrieval — KG-04). An edge pointing at one of these
   *   survives the dangling-edge gate (a lightweight stub endpoint is materialized)
   *   instead of being dropped. Omitted/empty ⇒ unchanged (no prior graph, no glossary).
   */
  merge(
    graphs: KnowledgeGraph[],
    knownExternalEndpointNames?: Set<string>
  ): Promise<KnowledgeGraph>;
}

import { Observation } from "./Observation";

export interface Entity {
  name: string;
  files: string[];
  chunk?: number;
  totalChunks?: number;
  entityType: string;
  observations: Observation[];
}

export interface Relation {
  from: string;
  to: string;
  relationType: string[];
  /**
   * The source span (chunk text) this edge was extracted from. Populated only
   * when the pipeline grounding stage is enabled (so the baseline graph carries
   * no extra weight); the co-occurrence grounding gate and Experiment 2 depend
   * on it. See `KnowledgeGraphBuilder.toGraph` and `GroundingTransform`.
   */
  sourceSpan?: string;
  /** Bi-temporal valid time, mirrored from the chunk provenance when known. */
  validAt?: string;
  // Inline grounding gate (Phase 5): set when `grounding.mode: flag` checks edges.
  // The triple is verbalized (`{from} {predicate} {to}`) and scored against the
  // source span; `grounded === false` marks an ungrounded edge that `drop` removes.
  grounded?: boolean;
  groundingScore?: number; // 0..1 grounding score for the verbalized triple
  /**
   * Reference-resolution edges (Phase 0, `links_to`/`cites`/`references`): the
   * document the edge was emitted from (corpus-relative path id). Distinct from
   * `sourceSpan` — this is provenance for a deterministic edge, not LLM output.
   */
  source?: string;
  /**
   * Reference-resolution edges: whether the target was found in the corpus
   * (internal links) or is otherwise a live, in-graph node. `false` marks a
   * bare edge to a stub node (e.g. an external/missing target) — never fabricate
   * the target's content. Absent on ordinary LLM-extracted relations.
   */
  resolved?: boolean;
  /**
   * Citation span-fetch faithfulness (Phase 2c): for a resolved `cites` edge, how
   * the citing claim fared against the span selected from the cited work's fetched
   * OA full text. `uncertain` when the support score lands inside the configured
   * band — a genuine abstain, not a forced verdict. Absent unless the edge was
   * fetched + claim-checked.
   */
  faithfulness?: "supported" | "unsupported" | "uncertain";
  /** 0..1 support score from the faithfulness checker (MiniCheck). */
  faithfulnessScore?: number;
  /** The span (cited-work passage) the citing claim was checked against. */
  supportingSpan?: string;
}

export interface KnowledgeGraph {
  entities: Entity[];
  relations: Relation[];
}

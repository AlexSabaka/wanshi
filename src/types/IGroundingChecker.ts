/**
 * Grounding checker: judges whether a single claim is supported by a source
 * text. This is the seam the inline grounding gate
 * (`KnowledgeGraphBuilder.applyGroundingGate`) routes through, so the cheap
 * keyword-overlap heuristic and a stronger NLI fact-checker (MiniCheck) are
 * interchangeable behind one interface.
 */
export interface GroundingVerdict {
  /** 0..1 grounding score (keyword overlap, or fraction of supported sentences). */
  score: number;
  /** Final verdict at the gate's threshold. */
  supported: boolean;
  /** Which checker decided — `keyword` when the pre-filter short-circuited. */
  checker: "keyword" | "minicheck";
}

export interface IGroundingChecker {
  /**
   * Judge `claim` against `source`. Implementations may decompose a multi-
   * sentence claim internally (MiniCheck wants atomic claims) and may keep a
   * keyword pre-filter to avoid an NLI call on obviously-grounded claims.
   */
  check(claim: string, source: string): Promise<GroundingVerdict>;
}

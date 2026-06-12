import { IGroundingChecker, GroundingVerdict } from "../../../types";
import { FactualEvaluator } from "../../../quality/FactualMetrics";

/**
 * The original grounding heuristic, now behind {@link IGroundingChecker}: the
 * fraction of a claim's content words found verbatim in the source. Cheap and
 * network-free — used both as the default checker and as the pre-filter inside
 * {@link MiniCheckGroundingChecker}. Punishes paraphrase and verbatim-name
 * absence (KG-08); that's exactly what MiniCheck escalation is for.
 */
export class KeywordGroundingChecker implements IGroundingChecker {
  constructor(private readonly min: number) {}

  async check(claim: string, source: string): Promise<GroundingVerdict> {
    const score = FactualEvaluator.observationGroundingScore(claim, source);
    return { score, supported: score >= this.min, checker: "keyword" };
  }
}

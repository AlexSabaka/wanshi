import { EvalMetrics, LevelMetrics, Triplet } from '../datasets/IDataset';
import { ExactMatcher } from '../matching/ExactMatcher';
import { SemanticMatcher } from '../matching/SemanticMatcher';

export function computeMetrics(tp: number, fp: number, fn: number): EvalMetrics {
  const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
  const recall    = tp + fn > 0 ? tp / (tp + fn) : 0;
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
  return { precision, recall, f1, tp, fp, fn };
}

/**
 * Compute exact-match P/R/F1 at entity, relation, and triple level.
 */
export function computeExactMetrics(
  extracted: Triplet[],
  groundTruth: Triplet[],
  matcher: ExactMatcher
): LevelMetrics {
  const entity   = computeMetrics(...Object.values(matcher.matchEntities(extracted, groundTruth)) as [number, number, number]);
  const relation = computeMetrics(...Object.values(matcher.matchRelations(extracted, groundTruth)) as [number, number, number]);
  const triple   = computeMetrics(...Object.values(matcher.matchTriplets(extracted, groundTruth)) as [number, number, number]);
  return { entity, relation, triple };
}

/**
 * Compute semantic P/R/F1 at entity, relation, and triple level.
 */
export async function computeSemanticMetrics(
  extracted: Triplet[],
  groundTruth: Triplet[],
  matcher: SemanticMatcher
): Promise<LevelMetrics> {
  const entityRaw   = await matcher.matchEntities(extracted, groundTruth);
  const relationRaw = await matcher.matchRelations(extracted, groundTruth);
  const tripleRaw   = await matcher.matchTriplets(extracted, groundTruth);

  return {
    entity:   computeMetrics(entityRaw.tp, entityRaw.fp, entityRaw.fn),
    relation: computeMetrics(relationRaw.tp, relationRaw.fp, relationRaw.fn),
    triple:   computeMetrics(tripleRaw.tp, tripleRaw.fp, tripleRaw.fn),
  };
}

/**
 * Micro-average LevelMetrics across multiple samples.
 */
export function microAverage(results: LevelMetrics[]): LevelMetrics {
  if (results.length === 0) {
    const zero: EvalMetrics = { precision: 0, recall: 0, f1: 0, tp: 0, fp: 0, fn: 0 };
    return { entity: zero, relation: zero, triple: zero };
  }

  const levels: (keyof LevelMetrics)[] = ['entity', 'relation', 'triple'];
  const averaged: Partial<LevelMetrics> = {};

  for (const level of levels) {
    const totalTP = results.reduce((s, r) => s + r[level].tp, 0);
    const totalFP = results.reduce((s, r) => s + r[level].fp, 0);
    const totalFN = results.reduce((s, r) => s + r[level].fn, 0);
    averaged[level] = computeMetrics(totalTP, totalFP, totalFN);
  }

  return averaged as LevelMetrics;
}

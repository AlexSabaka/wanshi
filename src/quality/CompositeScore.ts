import { ConsistencyMetrics } from './ConsistencyMetrics';
import { FactualMetrics } from './FactualMetrics';
import { SemanticMetrics } from './SemanticMetrics';
import { StructuralMetrics } from './StructuralMetrics';

export interface CompositeScore {
  overallQuality: number;
  breakdown: { structural: number; semantic: number; factual: number; consistency: number; };
  recommendations: string[];
}

export class QualityScoreCalculator {
  static calculateCompositeScore(
    structural: StructuralMetrics,
    semantic: SemanticMetrics,
    factual: FactualMetrics,
    consistency: ConsistencyMetrics
  ): CompositeScore {
    const structuralScore  = this.calcStructural(structural) * 25;
    const semanticScore    = this.calcSemantic(semantic) * 30;
    const factualScore     = this.calcFactual(factual) * 30;
    const consistencyScore = this.calcConsistency(consistency) * 15;

    return {
      overallQuality: structuralScore + semanticScore + factualScore + consistencyScore,
      breakdown: {
        structural: structuralScore, semantic: semanticScore,
        factual: factualScore, consistency: consistencyScore,
      },
      recommendations: this.recommend(structural, semantic, factual, consistency),
    };
  }

  private static calcStructural(m: StructuralMetrics): number {
    let s = 0;
    if (m.entityCount >= 3 && m.entityCount <= 15) s += 0.3;
    else if (m.entityCount > 0) s += 0.1;
    if (m.avgRelationsPerEntity >= 0.5 && m.avgRelationsPerEntity <= 2.0) s += 0.2;
    if (m.avgObservationsPerEntity >= 1 && m.avgObservationsPerEntity <= 5) s += 0.3;
    if (m.entityCount > 0 && m.connectedComponents <= 2) s += 0.2;
    return Math.min(s, 1.0);
  }

  private static calcSemantic(m: SemanticMetrics): number {
    return m.entityNameQuality * 0.2 + m.observationSpecificity * 0.3 +
           m.relationSemanticValidity * 0.2 + m.domainCoverage * 0.2 +
           m.entityTypeAppropriatenessScore * 0.1;
  }

  private static calcFactual(m: FactualMetrics): number {
    return (1 - m.hallucinationScore) * 0.5 + m.sourceGroundingScore * 0.3 +
           m.factualConsistencyScore * 0.2;
  }

  private static calcConsistency(m: ConsistencyMetrics): number {
    return m.crossFileConsistency * 0.4 + m.namingConsistency * 0.3 + m.typeConsistency * 0.3;
  }

  private static recommend(
    s: StructuralMetrics, sem: SemanticMetrics, f: FactualMetrics, c: ConsistencyMetrics
  ): string[] {
    const r: string[] = [];
    if (s.entityCount === 0) r.push('No entities extracted — check if file contains meaningful content');
    if (sem.observationSpecificity < 0.5) r.push('Observations are too generic — focus on specific facts');
    if (f.hallucinationScore > 0.3) r.push('High hallucination detected — ensure facts are grounded in source');
    if (c.namingConsistency < 0.7) r.push('Inconsistent naming patterns — standardize entity naming');
    if (s.isolatedEntities > s.entityCount * 0.5) r.push('Too many isolated entities — add more relationships');
    return r;
  }
}

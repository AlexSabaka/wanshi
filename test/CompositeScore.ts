import { ConsistencyMetrics } from "./ConsistencyMetrics";
import { FactualMetrics } from "./FactualMetrics";
import { SemanticMetrics } from "./SemanticMetrics";
import { StructuralMetrics } from "./StructuralMetrics";

// 5
export interface CompositeScore {
  overallQuality: number; // 0-100 score
  breakdown: {
    structural: number;
    semantic: number;
    factual: number;
    consistency: number;
  };
  recommendations: string[];
}
export class QualityScoreCalculator {
  static calculateCompositeScore(
    structural: StructuralMetrics,
    semantic: SemanticMetrics,
    factual: FactualMetrics,
    consistency: ConsistencyMetrics
  ): CompositeScore {

    // Structural score (0-25 points)
    const structuralScore = this.calculateStructuralScore(structural) * 25;

    // Semantic score (0-30 points) - most important
    const semanticScore = this.calculateSemanticScore(semantic) * 30;

    // Factual score (0-30 points) - most important
    const factualScore = this.calculateFactualScore(factual) * 30;

    // Consistency score (0-15 points)
    const consistencyScore = this.calculateConsistencyScore(consistency) * 15;

    const overallQuality = structuralScore + semanticScore + factualScore + consistencyScore;

    const recommendations = this.generateRecommendations(
      structural, semantic, factual, consistency
    );

    return {
      overallQuality,
      breakdown: {
        structural: structuralScore,
        semantic: semanticScore,
        factual: factualScore,
        consistency: consistencyScore
      },
      recommendations
    };
  }

  private static calculateStructuralScore(metrics: StructuralMetrics): number {
    let score = 0;

    // Entity count (prefer 3-15 entities per file)
    if (metrics.entityCount >= 3 && metrics.entityCount <= 15) {
      score += 0.3;
    } else if (metrics.entityCount > 0) {
      score += 0.1;
    }

    // Relations per entity (prefer 0.5-2.0)
    if (metrics.avgRelationsPerEntity >= 0.5 && metrics.avgRelationsPerEntity <= 2.0) {
      score += 0.2;
    }

    // Observations per entity (prefer 1-5)
    if (metrics.avgObservationsPerEntity >= 1 && metrics.avgObservationsPerEntity <= 5) {
      score += 0.3;
    }

    // Connected graph (prefer few components)
    if (metrics.connectedComponents <= 2) {
      score += 0.2;
    }

    return Math.min(score, 1.0);
  }

  private static calculateSemanticScore(metrics: SemanticMetrics): number {
    return (
      metrics.entityNameQuality * 0.2 +
      metrics.observationSpecificity * 0.3 +
      metrics.relationSemanticValidity * 0.2 +
      metrics.domainCoverage * 0.2 +
      metrics.entityTypeAppropriatenessScore * 0.1
    );
  }

  private static calculateFactualScore(metrics: FactualMetrics): number {
    return (
      (1 - metrics.hallucinationScore) * 0.5 + // Lower hallucination is better
      metrics.sourceGroundingScore * 0.3 +
      metrics.factualConsistencyScore * 0.2
    );
  }

  private static calculateConsistencyScore(metrics: ConsistencyMetrics): number {
    return (
      metrics.crossFileConsistency * 0.4 +
      metrics.namingConsistency * 0.3 +
      metrics.typeConsistency * 0.3
    );
  }

  private static generateRecommendations(
    structural: StructuralMetrics,
    semantic: SemanticMetrics,
    factual: FactualMetrics,
    consistency: ConsistencyMetrics
  ): string[] {
    const recommendations: string[] = [];

    if (structural.entityCount === 0) {
      recommendations.push("No entities extracted - check if file contains meaningful content");
    }

    if (semantic.observationSpecificity < 0.5) {
      recommendations.push("Observations are too generic - focus on specific, detailed facts");
    }

    if (factual.hallucinationScore > 0.3) {
      recommendations.push("High hallucination detected - ensure all facts are grounded in source");
    }

    if (consistency.namingConsistency < 0.7) {
      recommendations.push("Inconsistent naming patterns - standardize entity naming");
    }

    if (structural.isolatedEntities > structural.entityCount * 0.5) {
      recommendations.push("Too many isolated entities - add more relationships");
    }

    return recommendations;
  }
}

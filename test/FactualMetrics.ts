import { KnowledgeGraph } from "../src/types";

//3


export interface FactualMetrics {
  hallucinationScore: number; // 0-1 (lower is better)
  sourceGroundingScore: number; // 0-1 score
  factualConsistencyScore: number; // 0-1 score
}
export class FactualEvaluator {
  static calculateFactualMetrics(
    graph: KnowledgeGraph,
    sourceContent: string,
    fileName: string
  ): FactualMetrics {
    const hallucinationScore = this.detectHallucinations(graph, sourceContent);
    const sourceGroundingScore = this.evaluateSourceGrounding(graph, sourceContent);
    const factualConsistencyScore = this.evaluateFactualConsistency(graph);

    return {
      hallucinationScore,
      sourceGroundingScore,
      factualConsistencyScore
    };
  }

  private static detectHallucinations(graph: KnowledgeGraph, sourceContent: string): number {
    let totalClaims = 0;
    let ungroundedClaims = 0;

    for (const entity of graph.entities) {
      for (const obs of entity.observations || []) {
        totalClaims++;

        // Check if observation can be verified in source
        if (!this.isClaimGrounded(obs, sourceContent, entity.name)) {
          ungroundedClaims++;
        }
      }
    }

    return totalClaims > 0 ? ungroundedClaims / totalClaims : 0;
  }

  private static isClaimGrounded(claim: string, sourceContent: string, entityName: string): boolean {
    const lowerClaim = claim.toLowerCase();
    const lowerSource = sourceContent.toLowerCase();
    const lowerEntity = entityName.toLowerCase();

    // Entity should appear in source
    if (!lowerSource.includes(lowerEntity)) {
      return false;
    }

    // Check for specific claim keywords in source
    const claimKeywords = lowerClaim.split(' ').filter(word => word.length > 3);
    let foundKeywords = 0;

    for (const keyword of claimKeywords) {
      if (lowerSource.includes(keyword)) {
        foundKeywords++;
      }
    }

    // At least 50% of claim keywords should be in source
    return claimKeywords.length > 0 && (foundKeywords / claimKeywords.length) >= 0.5;
  }

  private static evaluateSourceGrounding(graph: KnowledgeGraph, sourceContent: string): number {
    const sourceTerms = new Set(
      sourceContent.toLowerCase().match(/[a-zA-Z_][a-zA-Z0-9_]*/g) || []
    );

    let groundedEntities = 0;
    for (const entity of graph.entities) {
      if (sourceTerms.has(entity.name.toLowerCase()) ||
        Array.from(sourceTerms).some(term => term.includes(entity.name.toLowerCase()) ||
          entity.name.toLowerCase().includes(term)
        )) {
        groundedEntities++;
      }
    }

    return graph.entities.length > 0 ? groundedEntities / graph.entities.length : 1.0;
  }

  private static evaluateFactualConsistency(graph: KnowledgeGraph): number {
    // Check for logical contradictions in observations
    let totalPairs = 0;
    let consistentPairs = 0;

    for (const entity of graph.entities) {
      const observations = entity.observations || [];
      for (let i = 0; i < observations.length; i++) {
        for (let j = i + 1; j < observations.length; j++) {
          totalPairs++;
          if (!this.areObservationsContradictory(observations[i], observations[j])) {
            consistentPairs++;
          }
        }
      }
    }

    return totalPairs > 0 ? consistentPairs / totalPairs : 1.0;
  }

  private static areObservationsContradictory(obs1: string, obs2: string): boolean {
    // Simple contradiction detection
    const contradictions = [
      ['synchronous', 'asynchronous'],
      ['mutable', 'immutable'],
      ['public', 'private'],
      ['static', 'dynamic']
    ];

    const lower1 = obs1.toLowerCase();
    const lower2 = obs2.toLowerCase();

    for (const [term1, term2] of contradictions) {
      if ((lower1.includes(term1) && lower2.includes(term2)) ||
        (lower1.includes(term2) && lower2.includes(term1))) {
        return true;
      }
    }

    return false;
  }
}

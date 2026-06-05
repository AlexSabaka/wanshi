import { KnowledgeGraph, obsText } from '../types';

export interface FactualMetrics {
  hallucinationScore: number;
  sourceGroundingScore: number;
  factualConsistencyScore: number;
}

export class FactualEvaluator {
  static calculateFactualMetrics(graph: KnowledgeGraph, sourceContent: string, _fileName: string): FactualMetrics {
    return {
      hallucinationScore:      this.detectHallucinations(graph, sourceContent),
      sourceGroundingScore:    this.evaluateSourceGrounding(graph, sourceContent),
      factualConsistencyScore: this.evaluateFactualConsistency(graph),
    };
  }

  private static detectHallucinations(graph: KnowledgeGraph, source: string): number {
    let total = 0, ungrounded = 0;
    for (const e of graph.entities) {
      for (const obs of e.observations || []) {
        total++;
        if (!this.isClaimGrounded(obsText(obs), source, e.name)) ungrounded++;
      }
    }
    return total > 0 ? ungrounded / total : 0;
  }

  /**
   * Per-observation grounding score: the fraction of a claim's content words
   * (length > 3) found in the source text (0..1; 1 when there are no content
   * words). Cheap keyword-overlap heuristic — this method is the seam where a
   * stronger check (NLI / structured field extraction) would slot in. Used both
   * by the offline metrics and the inline grounding gate.
   */
  static observationGroundingScore(text: string, source: string): number {
    const lSrc = source.toLowerCase();
    const keywords = text.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    if (keywords.length === 0) return 1;
    const found = keywords.filter(k => lSrc.includes(k)).length;
    return found / keywords.length;
  }

  private static isClaimGrounded(claim: string, source: string, entity: string): boolean {
    if (!source.toLowerCase().includes(entity.toLowerCase())) return false;
    return this.observationGroundingScore(claim, source) >= 0.5;
  }

  private static evaluateSourceGrounding(graph: KnowledgeGraph, source: string): number {
    const terms = new Set((source.toLowerCase().match(/[a-zA-Z_][a-zA-Z0-9_]*/g) || []));
    let grounded = 0;
    for (const e of graph.entities) {
      const n = e.name.toLowerCase();
      if (terms.has(n) || Array.from(terms).some(t => t.includes(n) || n.includes(t))) grounded++;
    }
    return graph.entities.length > 0 ? grounded / graph.entities.length : 0;
  }

  private static evaluateFactualConsistency(graph: KnowledgeGraph): number {
    const contradictions = [
      ['synchronous', 'asynchronous'], ['mutable', 'immutable'],
      ['public', 'private'], ['static', 'dynamic'],
    ];
    let pairs = 0, consistent = 0;
    for (const e of graph.entities) {
      const obs = e.observations || [];
      for (let i = 0; i < obs.length; i++) {
        for (let j = i + 1; j < obs.length; j++) {
          pairs++;
          const lo1 = obsText(obs[i]).toLowerCase(), lo2 = obsText(obs[j]).toLowerCase();
          const conflict = contradictions.some(
            ([a, b]) => (lo1.includes(a) && lo2.includes(b)) || (lo1.includes(b) && lo2.includes(a))
          );
          if (!conflict) consistent++;
        }
      }
    }
    return pairs > 0 ? consistent / pairs : 1.0;
  }
}

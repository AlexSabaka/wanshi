import { KnowledgeGraph, Entity, Relation, obsText } from '../types';

export interface SemanticMetrics {
  entityNameQuality: number;
  observationSpecificity: number;
  relationSemanticValidity: number;
  domainCoverage: number;
  entityTypeAppropriatenessScore: number;
}

export class SemanticEvaluator {
  private static TRIVIAL_OBSERVATIONS = new Set([
    'is a number', 'is a variable', 'is a concept', 'is a function',
    'is a string', 'is a value', 'is a method', 'exists', 'is defined',
  ]);

  private static MEANINGFUL_ENTITY_TYPES = new Set([
    'algorithm', 'function', 'class', 'module', 'database', 'api_endpoint',
    'research_task', 'chemical_compound', 'protein', 'gene', 'equation',
    'neural_network', 'quantum_algorithm', 'experimental_technique',
  ]);

  static calculateSemanticMetrics(graph: KnowledgeGraph, fileContent: string): SemanticMetrics {
    return {
      entityNameQuality:             this.evaluateEntityNames(graph.entities),
      observationSpecificity:        this.evaluateObservationSpecificity(graph.entities),
      relationSemanticValidity:      this.evaluateRelationValidity(graph.relations),
      domainCoverage:                this.evaluateDomainCoverage(graph, fileContent),
      entityTypeAppropriatenessScore: this.evaluateEntityTypes(graph.entities),
    };
  }

  private static evaluateEntityNames(entities: Entity[]): number {
    if (entities.length === 0) return 0;
    let score = 0;
    for (const e of entities) {
      let s = 0;
      if (/^[a-z][a-z0-9_]*[a-z0-9]$/.test(e.name)) s += 0.3;
      if (e.name.length > 3 && !['data', 'item', 'value', 'object'].includes(e.name)) s += 0.4;
      if (e.name.includes('_') || /[A-Z]/.test(e.name)) s += 0.3;
      score += Math.min(s, 1.0);
    }
    return score / entities.length;
  }

  private static evaluateObservationSpecificity(entities: Entity[]): number {
    let total = 0, specific = 0;
    for (const e of entities) {
      for (const obs of e.observations || []) {
        total++;
        const t = obsText(obs);
        if (!this.TRIVIAL_OBSERVATIONS.has(t.toLowerCase())) {
          if (t.length > 10 || /\d/.test(t) ||
              t.includes('implements') || t.includes('uses') ||
              t.includes('version') || t.includes('located')) {
            specific++;
          }
        }
      }
    }
    return total > 0 ? specific / total : 0;
  }

  private static evaluateRelationValidity(relations: Relation[]): number {
    if (relations.length === 0) return 0;
    const valid = new Set([
      'uses', 'implements', 'extends', 'contains', 'calls', 'depends_on',
      'targets', 'binds_to', 'catalyzes', 'measures', 'processes',
      'configured_with', 'provides_training_data', 'evaluates',
    ]);
    let count = 0;
    for (const r of relations) {
      const types = Array.isArray(r.relationType) ? r.relationType : [r.relationType];
      if (types.some(t => valid.has(t))) count++;
    }
    return count / relations.length;
  }

  private static evaluateDomainCoverage(graph: KnowledgeGraph, content: string): number {
    const terms = content.match(/[a-zA-Z_][a-zA-Z0-9_]*/g) || [];
    const unique = new Set(terms.filter(t => t.length > 3));
    if (unique.size === 0) return 0;
    const entityNames = new Set(graph.entities.map(e => e.name.toLowerCase()));
    let covered = 0;
    for (const term of unique) {
      if (entityNames.has(term.toLowerCase()) ||
          Array.from(entityNames).some(n => n.includes(term.toLowerCase()))) {
        covered++;
      }
    }
    return Math.min(covered / unique.size, 1.0);
  }

  private static evaluateEntityTypes(entities: Entity[]): number {
    if (entities.length === 0) return 0;
    let count = 0;
    for (const e of entities) {
      if (this.MEANINGFUL_ENTITY_TYPES.has(e.entityType) ||
          e.entityType.includes('_') || e.entityType.length > 6) {
        count++;
      }
    }
    return count / entities.length;
  }
}

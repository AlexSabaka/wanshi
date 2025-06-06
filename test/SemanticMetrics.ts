import { KnowledgeGraph, Entity, Relation } from "../src/types";

//2


export interface SemanticMetrics {
  entityNameQuality: number; // 0-1 score
  observationSpecificity: number; // 0-1 score  
  relationSemanticValidity: number; // 0-1 score
  domainCoverage: number; // 0-1 score
  entityTypeAppropriatenessScore: number; // 0-1 score
}
export class SemanticEvaluator {
  private static TRIVIAL_OBSERVATIONS = new Set([
    'is a number', 'is a variable', 'is a concept', 'is a function',
    'is a string', 'is a value', 'is a method', 'exists', 'is defined'
  ]);

  private static MEANINGFUL_ENTITY_TYPES = new Set([
    'algorithm', 'function', 'class', 'module', 'database', 'api_endpoint',
    'research_task', 'chemical_compound', 'protein', 'gene', 'equation',
    'neural_network', 'quantum_algorithm', 'experimental_technique'
  ]);

  static calculateSemanticMetrics(graph: KnowledgeGraph, fileContent: string): SemanticMetrics {
    // Entity name quality (snake_case, descriptive, not generic)
    const entityNameQuality = this.evaluateEntityNames(graph.entities);

    // Observation specificity (detailed, non-trivial observations)
    const observationSpecificity = this.evaluateObservationSpecificity(graph.entities);

    // Relation semantic validity
    const relationSemanticValidity = this.evaluateRelationValidity(graph.relations);

    // Domain coverage (how well it captures file content)
    const domainCoverage = this.evaluateDomainCoverage(graph, fileContent);

    // Entity type appropriateness
    const entityTypeAppropriatenessScore = this.evaluateEntityTypes(graph.entities);

    return {
      entityNameQuality,
      observationSpecificity,
      relationSemanticValidity,
      domainCoverage,
      entityTypeAppropriatenessScore
    };
  }

  private static evaluateEntityNames(entities: Entity[]): number {
    if (entities.length === 0) return 1.0;

    let score = 0;
    for (const entity of entities) {
      let entityScore = 0;

      // Check naming convention (snake_case preferred)
      if (/^[a-z][a-z0-9_]*[a-z0-9]$/.test(entity.name)) {
        entityScore += 0.3;
      }

      // Check descriptiveness (length > 3, not generic)
      if (entity.name.length > 3 && !['data', 'item', 'value', 'object'].includes(entity.name)) {
        entityScore += 0.4;
      }

      // Check for meaningful components
      if (entity.name.includes('_') || /[A-Z]/.test(entity.name)) {
        entityScore += 0.3;
      }

      score += Math.min(entityScore, 1.0);
    }

    return score / entities.length;
  }

  private static evaluateObservationSpecificity(entities: Entity[]): number {
    let totalObservations = 0;
    let specificObservations = 0;

    for (const entity of entities) {
      for (const obs of entity.observations || []) {
        totalObservations++;

        // Check if observation is trivial
        if (!this.TRIVIAL_OBSERVATIONS.has(obs.toLowerCase())) {
          // Check for specificity indicators
          if (obs.length > 10 || // Detailed description
            /\d/.test(obs) || // Contains numbers/measurements
            obs.includes('implements') || obs.includes('uses') ||
            obs.includes('version') || obs.includes('located')) {
            specificObservations++;
          }
        }
      }
    }

    return totalObservations > 0 ? specificObservations / totalObservations : 1.0;
  }

  private static evaluateRelationValidity(relations: Relation[]): number {
    if (relations.length === 0) return 1.0;

    const validRelationTypes = new Set([
      'uses', 'implements', 'extends', 'contains', 'calls', 'depends_on',
      'targets', 'binds_to', 'catalyzes', 'measures', 'processes',
      'configured_with', 'provides_training_data', 'evaluates'
    ]);

    let validRelations = 0;
    for (const relation of relations) {
      const relTypes = Array.isArray(relation.relationType) ? relation.relationType : [relation.relationType];
      if (relTypes.some(type => validRelationTypes.has(type))) {
        validRelations++;
      }
    }

    return validRelations / relations.length;
  }

  private static evaluateDomainCoverage(graph: KnowledgeGraph, fileContent: string): number {
    // Extract key terms from file content
    const codeTerms = fileContent.match(/[a-zA-Z_][a-zA-Z0-9_]*/g) || [];
    const uniqueTerms = new Set(codeTerms.filter(term => term.length > 3));

    if (uniqueTerms.size === 0) return 0;

    // Check how many file terms are covered by entities
    let coveredTerms = 0;
    const entityNames = new Set(graph.entities.map(e => e.name.toLowerCase()));

    for (const term of uniqueTerms) {
      if (entityNames.has(term.toLowerCase()) ||
        Array.from(entityNames).some(name => name.includes(term.toLowerCase()))) {
        coveredTerms++;
      }
    }

    return Math.min(coveredTerms / uniqueTerms.size, 1.0);
  }

  private static evaluateEntityTypes(entities: Entity[]): number {
    if (entities.length === 0) return 1.0;

    let appropriateTypes = 0;
    for (const entity of entities) {
      if (this.MEANINGFUL_ENTITY_TYPES.has(entity.entityType) ||
        entity.entityType.includes('_') || // Compound types
        entity.entityType.length > 6) { // Descriptive types
        appropriateTypes++;
      }
    }

    return appropriateTypes / entities.length;
  }
}

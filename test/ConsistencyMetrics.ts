import { KnowledgeGraph } from "../src/types";

//4


export interface ConsistencyMetrics {
  crossFileConsistency: number; // 0-1 score
  namingConsistency: number; // 0-1 score
  typeConsistency: number; // 0-1 score
}
export class ConsistencyEvaluator {
  static calculateConsistencyMetrics(
    graphs: KnowledgeGraph[],
    currentGraph: KnowledgeGraph
  ): ConsistencyMetrics {
    const crossFileConsistency = this.evaluateCrossFileConsistency(graphs, currentGraph);
    const namingConsistency = this.evaluateNamingConsistency(currentGraph);
    const typeConsistency = this.evaluateTypeConsistency(currentGraph);

    return {
      crossFileConsistency,
      namingConsistency,
      typeConsistency
    };
  }

  private static evaluateCrossFileConsistency(
    existingGraphs: KnowledgeGraph[],
    currentGraph: KnowledgeGraph
  ): number {
    if (existingGraphs.length === 0) return 1.0;

    // Build entity name map from existing graphs
    const existingEntities = new Map<string, Set<string>>();
    for (const graph of existingGraphs) {
      for (const entity of graph.entities) {
        if (!existingEntities.has(entity.name)) {
          existingEntities.set(entity.name, new Set());
        }
        existingEntities.get(entity.name)!.add(entity.entityType);
      }
    }

    let consistentEntities = 0;
    let totalMatchingEntities = 0;

    for (const entity of currentGraph.entities) {
      if (existingEntities.has(entity.name)) {
        totalMatchingEntities++;
        const existingTypes = existingEntities.get(entity.name)!;
        if (existingTypes.has(entity.entityType)) {
          consistentEntities++;
        }
      }
    }

    return totalMatchingEntities > 0 ? consistentEntities / totalMatchingEntities : 1.0;
  }

  private static evaluateNamingConsistency(graph: KnowledgeGraph): number {
    const namingPatterns = new Map<string, number>();

    for (const entity of graph.entities) {
      // Detect naming pattern
      let pattern = 'other';
      if (/^[a-z][a-z0-9_]*$/.test(entity.name)) {
        pattern = 'snake_case';
      } else if (/^[a-z][a-zA-Z0-9]*$/.test(entity.name)) {
        pattern = 'camelCase';
      } else if (/^[A-Z][a-zA-Z0-9]*$/.test(entity.name)) {
        pattern = 'PascalCase';
      }

      namingPatterns.set(pattern, (namingPatterns.get(pattern) || 0) + 1);
    }

    if (namingPatterns.size === 0) return 1.0;

    // Calculate consistency as dominance of most common pattern
    const maxCount = Math.max(...namingPatterns.values());
    const totalEntities = graph.entities.length;

    return totalEntities > 0 ? maxCount / totalEntities : 1.0;
  }

  private static evaluateTypeConsistency(graph: KnowledgeGraph): number {
    // Check if similar entities have consistent types
    const entityGroups = new Map<string, string[]>();

    for (const entity of graph.entities) {
      // Group by name similarity (first word)
      const baseWord = entity.name.split(/[_-]/)[0].toLowerCase();
      if (!entityGroups.has(baseWord)) {
        entityGroups.set(baseWord, []);
      }
      entityGroups.get(baseWord)!.push(entity.entityType);
    }

    let consistentGroups = 0;
    let totalGroups = 0;

    for (const [_, types] of entityGroups) {
      if (types.length > 1) {
        totalGroups++;
        const uniqueTypes = new Set(types);
        if (uniqueTypes.size === 1) {
          consistentGroups++;
        }
      }
    }

    return totalGroups > 0 ? consistentGroups / totalGroups : 1.0;
  }
}

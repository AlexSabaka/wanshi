import { KnowledgeGraph } from '../types';

export interface ConsistencyMetrics {
  crossFileConsistency: number;
  namingConsistency: number;
  typeConsistency: number;
}

export class ConsistencyEvaluator {
  static calculateConsistencyMetrics(graphs: KnowledgeGraph[], current: KnowledgeGraph): ConsistencyMetrics {
    return {
      crossFileConsistency: this.evaluateCrossFile(graphs, current),
      namingConsistency:    this.evaluateNaming(current),
      typeConsistency:      this.evaluateTypes(current),
    };
  }

  private static evaluateCrossFile(existing: KnowledgeGraph[], current: KnowledgeGraph): number {
    if (existing.length === 0) return 1.0;
    const map = new Map<string, Set<string>>();
    for (const g of existing) {
      for (const e of g.entities) {
        if (!map.has(e.name)) map.set(e.name, new Set());
        map.get(e.name)!.add(e.entityType);
      }
    }
    let total = 0, consistent = 0;
    for (const e of current.entities) {
      if (map.has(e.name)) {
        total++;
        if (map.get(e.name)!.has(e.entityType)) consistent++;
      }
    }
    return total > 0 ? consistent / total : 1.0;
  }

  private static evaluateNaming(graph: KnowledgeGraph): number {
    const patterns = new Map<string, number>();
    for (const e of graph.entities) {
      let p = 'other';
      if (/^[a-z][a-z0-9_]*$/.test(e.name)) p = 'snake_case';
      else if (/^[a-z][a-zA-Z0-9]*$/.test(e.name)) p = 'camelCase';
      else if (/^[A-Z][a-zA-Z0-9]*$/.test(e.name)) p = 'PascalCase';
      patterns.set(p, (patterns.get(p) || 0) + 1);
    }
    if (patterns.size === 0) return 0;
    const max = Math.max(...patterns.values());
    return graph.entities.length > 0 ? max / graph.entities.length : 1.0;
  }

  private static evaluateTypes(graph: KnowledgeGraph): number {
    const groups = new Map<string, string[]>();
    for (const e of graph.entities) {
      const key = e.name.split(/[_-]/)[0].toLowerCase();
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(e.entityType);
    }
    let total = 0, consistent = 0;
    for (const types of groups.values()) {
      if (types.length > 1) {
        total++;
        if (new Set(types).size === 1) consistent++;
      }
    }
    return total > 0 ? consistent / total : 1.0;
  }
}

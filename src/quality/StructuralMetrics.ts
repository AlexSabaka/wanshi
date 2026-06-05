import { KnowledgeGraph } from '../types';

export interface StructuralMetrics {
  entityCount: number;
  relationCount: number;
  entityTypeDistribution: Record<string, number>;
  relationTypeDistribution: Record<string, number>;
  avgObservationsPerEntity: number;
  avgRelationsPerEntity: number;
  graphDensity: number;
  connectedComponents: number;
  isolatedEntities: number;
}

export class KnowledgeGraphEvaluator {
  static calculateStructuralMetrics(graph: KnowledgeGraph): StructuralMetrics {
    const entityCount = graph.entities.length;
    const relationCount = graph.relations.length;

    const entityTypeDistribution: Record<string, number> = {};
    graph.entities.forEach(entity => {
      entityTypeDistribution[entity.entityType] = (entityTypeDistribution[entity.entityType] || 0) + 1;
    });

    const relationTypeDistribution: Record<string, number> = {};
    graph.relations.forEach(relation => {
      const relTypes = Array.isArray(relation.relationType) ? relation.relationType : [relation.relationType];
      relTypes.forEach(type => {
        relationTypeDistribution[type] = (relationTypeDistribution[type] || 0) + 1;
      });
    });

    const totalObservations = graph.entities.reduce((sum, e) => sum + (e.observations?.length || 0), 0);
    const avgObservationsPerEntity = entityCount > 0 ? totalObservations / entityCount : 0;

    const maxPossibleRelations = entityCount * (entityCount - 1);
    const graphDensity = maxPossibleRelations > 0 ? relationCount / maxPossibleRelations : 0;

    const entityNames = new Set(graph.entities.map(e => e.name));
    const adj = new Map<string, Set<string>>();
    graph.entities.forEach(e => adj.set(e.name, new Set()));
    graph.relations.forEach(r => {
      if (entityNames.has(r.from) && entityNames.has(r.to)) {
        adj.get(r.from)?.add(r.to);
        adj.get(r.to)?.add(r.from);
      }
    });

    const visited = new Set<string>();
    let connectedComponents = 0;
    for (const entity of entityNames) {
      if (!visited.has(entity)) {
        connectedComponents++;
        const stack = [entity];
        while (stack.length > 0) {
          const cur = stack.pop()!;
          if (!visited.has(cur)) {
            visited.add(cur);
            adj.get(cur)?.forEach(n => { if (!visited.has(n)) stack.push(n); });
          }
        }
      }
    }

    return {
      entityCount, relationCount, entityTypeDistribution, relationTypeDistribution,
      avgObservationsPerEntity,
      avgRelationsPerEntity: entityCount > 0 ? relationCount / entityCount : 0,
      graphDensity, connectedComponents,
      isolatedEntities: entityCount - visited.size,
    };
  }
}

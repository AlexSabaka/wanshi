import { KnowledgeGraph } from "../src/types";
import { ConsistencyMetrics } from "./ConsistencyMetrics";
import { FactualMetrics } from "./FactualMetrics";
import { SemanticMetrics } from "./SemanticMetrics";

//1
interface QualityMetrics {
  structural: StructuralMetrics;
  semantic: SemanticMetrics;
  factual: FactualMetrics;
  consistency: ConsistencyMetrics;
}
export interface StructuralMetrics {
  entityCount: number;
  relationCount: number;
  entityTypeDistribution: Record<string, number>;
  relationTypeDistribution: Record<string, number>;
  avgObservationsPerEntity: number;
  avgRelationsPerEntity: number;
  graphDensity: number; // relations / (entities * (entities-1))
  connectedComponents: number;
  isolatedEntities: number;
}
export class KnowledgeGraphEvaluator {
  static calculateStructuralMetrics(graph: KnowledgeGraph): StructuralMetrics {
    const entityCount = graph.entities.length;
    const relationCount = graph.relations.length;

    // Entity type distribution
    const entityTypeDistribution: Record<string, number> = {};
    graph.entities.forEach(entity => {
      entityTypeDistribution[entity.entityType] = (entityTypeDistribution[entity.entityType] || 0) + 1;
    });

    // Relation type distribution
    const relationTypeDistribution: Record<string, number> = {};
    graph.relations.forEach(relation => {
      const relTypes = Array.isArray(relation.relationType) ? relation.relationType : [relation.relationType];
      relTypes.forEach(type => {
        relationTypeDistribution[type] = (relationTypeDistribution[type] || 0) + 1;
      });
    });

    // Average observations per entity
    const totalObservations = graph.entities.reduce((sum, entity) => sum + (entity.observations?.length || 0), 0);
    const avgObservationsPerEntity = entityCount > 0 ? totalObservations / entityCount : 0;

    // Graph density
    const maxPossibleRelations = entityCount * (entityCount - 1);
    const graphDensity = maxPossibleRelations > 0 ? relationCount / maxPossibleRelations : 0;

    // Connected components analysis
    const entityNames = new Set(graph.entities.map(e => e.name));
    const relationGraph = new Map<string, Set<string>>();

    graph.entities.forEach(entity => {
      relationGraph.set(entity.name, new Set());
    });

    graph.relations.forEach(relation => {
      if (entityNames.has(relation.from) && entityNames.has(relation.to)) {
        relationGraph.get(relation.from)?.add(relation.to);
        relationGraph.get(relation.to)?.add(relation.from);
      }
    });

    const visited = new Set<string>();
    let connectedComponents = 0;

    for (const entity of entityNames) {
      if (!visited.has(entity)) {
        connectedComponents++;
        const stack = [entity];
        while (stack.length > 0) {
          const current = stack.pop()!;
          if (!visited.has(current)) {
            visited.add(current);
            relationGraph.get(current)?.forEach(neighbor => {
              if (!visited.has(neighbor)) {
                stack.push(neighbor);
              }
            });
          }
        }
      }
    }

    const isolatedEntities = entityCount - visited.size;

    return {
      entityCount,
      relationCount,
      entityTypeDistribution,
      relationTypeDistribution,
      avgObservationsPerEntity,
      avgRelationsPerEntity: entityCount > 0 ? relationCount / entityCount : 0,
      graphDensity,
      connectedComponents,
      isolatedEntities
    };
  }
}

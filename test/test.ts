import { CompositeScore,
  ConsistencyEvaluator,
  FactualEvaluator,
  KnowledgeGraphEvaluator,
  QualityScoreCalculator,
  SemanticEvaluator } from ".";
import { KnowledgeGraph } from "../src/types";


// Usage example:
export function evaluateKnowledgeGraphQuality(
  graph: KnowledgeGraph,
  sourceContent: string,
  fileName: string,
  existingGraphs: KnowledgeGraph[] = []
): CompositeScore {
  const structural = KnowledgeGraphEvaluator.calculateStructuralMetrics(graph);
  const semantic = SemanticEvaluator.calculateSemanticMetrics(graph, sourceContent);
  const factual = FactualEvaluator.calculateFactualMetrics(graph, sourceContent, fileName);
  const consistency = ConsistencyEvaluator.calculateConsistencyMetrics(existingGraphs, graph);
  
  return QualityScoreCalculator.calculateCompositeScore(structural, semantic, factual, consistency);
}
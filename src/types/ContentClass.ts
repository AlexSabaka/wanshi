import { KnowledgeGraph } from "./KnowledgeGraph";

export type ContentClass =
  // Domain-specific (distinct entity vocabularies)
  | "code" // functions, classes, APIs, modules, dependencies
  | "financial" // companies, stocks, metrics, transactions, regulations
  | "medical" // conditions, treatments, drugs, anatomy, procedures
  | "legal" // parties, contracts, statutes, jurisdictions, obligations
  | "research" // hypotheses, experiments, methodologies, results, datasets
  | "transcript" // speakers, topics, decisions, action items, timelines

  // Structural (distinct relationship patterns)
  | "tabular" // columns, rows, metrics, data relationships, schemas
  | "communication" // people, organizations, projects, commitments, threads
  | "documentation" // features, procedures, examples, requirements, guides

  // Generic fallbacks (when domain unclear)
  | "technical" // systems, services, configurations, logs, infrastructure
  | "narrative" // topics, concepts, events, general prose content
  | "reference"; // definitions, lists, catalogs, structured facts

export interface ClassificationResult {
  class: ContentClass;
  confidence: number;
}

/**
 * Few-shot NER example output. Mirrors the *raw* LLM shape (observations are
 * bare strings), not the runtime `KnowledgeGraph` (whose observations are
 * provenance-stamped `Observation` objects).
 */
export interface NERExampleEntity {
  name: string;
  files?: string[];
  entityType: string;
  observations: string[];
}
export interface NERExampleGraph {
  entities: NERExampleEntity[];
  relations: { from: string; to: string; relationType: string[] }[];
}

export interface PromptContentExample {
  filePath: string;
  fileContent: string;
  output: NERExampleGraph;
}

export interface ContentClassConfig {
  name: ContentClass;
  filePatterns: ContentPattern[];
  contentPatterns: ContentPattern[];
}

export interface ContentPattern {
  pattern: RegExp;
  weight: number;
}

export interface ContentClassNERExample {
  name: ContentClass;
  description: string;
  examples: PromptContentExample[];
  primaryEntityTypes: string[];
  primaryRelationTypes: string[];
}

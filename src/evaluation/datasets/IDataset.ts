export interface Triplet {
  subject: string;
  predicate: string;
  object: string;
}

export interface BenchmarkSample {
  id: string;
  text: string;
  groundTruth: Triplet[];
  domain?: string;
}

export interface EvalMetrics {
  precision: number;
  recall: number;
  f1: number;
  tp: number;
  fp: number;
  fn: number;
}

export interface LevelMetrics {
  entity: EvalMetrics;
  relation: EvalMetrics;
  triple: EvalMetrics;
}

export interface SampleResult {
  id: string;
  domain?: string;
  extracted: Triplet[];
  groundTruth: Triplet[];
  exact: LevelMetrics;
  semantic: LevelMetrics;
  intrinsicScore: number;
  durationMs: number;
  /** Raw KG counts before conversion to triplets */
  kgEntityCount: number;
  kgRelationCount: number;
}

export interface ExtractionStats {
  avgKgEntities: number;
  avgKgRelations: number;
  /** Samples where kg.relations was empty (model produced entities but no relations, or failed entirely) */
  samplesWithNoRelations: number;
}

export interface BenchmarkResult {
  dataset: string;
  model: string;
  classifier: string;
  sampleCount: number;
  exact: LevelMetrics;
  semantic: LevelMetrics;
  intrinsicQuality: {
    mean: number;
    breakdown: { structural: number; semantic: number; factual: number; consistency: number };
  };
  extractionStats: ExtractionStats;
  perSample: SampleResult[];
  durationMs: number;
}

export interface IDatasetLoader {
  load(dataPath: string, limit: number, domain?: string): Promise<BenchmarkSample[]>;
}

import { KnowledgeGraphBuilder } from '../core/knowledge/KnowledgeGraphBuilder';
import { PromptManager } from '../core/llm/prompts/PromptManager';
import { EmbeddingService } from '../core/llm/EmbeddingService';
import { Logger } from '../shared';
import { ProcessedFile } from '../types';
import { KnowledgeGraph } from '../types/KnowledgeGraph';

import {
  KnowledgeGraphEvaluator,
  SemanticEvaluator,
  FactualEvaluator,
  ConsistencyEvaluator,
  QualityScoreCalculator,
} from '../quality';

import { BenchmarkResult, BenchmarkSample, ExtractionStats, LevelMetrics, SampleResult, Triplet } from './datasets/IDataset';
import { ExactMatcher } from './matching/ExactMatcher';
import { SemanticMatcher } from './matching/SemanticMatcher';
import { computeExactMetrics, computeSemanticMetrics, microAverage } from './metrics/TripleMetrics';

export interface BenchmarkOptions {
  datasetName: string;
  model: string;
  classifier: string;
  matchThreshold: number;
}

export class BenchmarkRunner {
  private exactMatcher = new ExactMatcher();
  private semanticMatcher: SemanticMatcher;

  constructor(
    private kgBuilder: KnowledgeGraphBuilder,
    private promptManager: PromptManager,
    private embeddingService: EmbeddingService,
    private logger: Logger,
    matchThreshold: number = 0.80
  ) {
    this.semanticMatcher = new SemanticMatcher(embeddingService, matchThreshold);
  }

  async run(samples: BenchmarkSample[], opts: BenchmarkOptions): Promise<BenchmarkResult> {
    const startTime = Date.now();
    const sampleResults: SampleResult[] = [];

    this.logger.info(`Starting benchmark: ${opts.datasetName} (${samples.length} samples)`);

    const systemPrompt = await this.promptManager.getSystemPrompt('benchmark', '**/*.txt', 'Benchmark evaluation');

    for (let i = 0; i < samples.length; i++) {
      const sample = samples[i];
      this.logger.info(`[${i + 1}/${samples.length}] Processing sample ${sample.id}`);

      const sampleStart = Date.now();
      const result = await this.processSample(sample, systemPrompt);
      result.durationMs = Date.now() - sampleStart;

      sampleResults.push(result);

      // Progress log every 10 samples
      if ((i + 1) % 10 === 0) {
        const partial = microAverage(sampleResults.map(r => r.semantic));
        this.logger.info(`  Progress: Sem Triple F1 so far = ${partial.triple.f1.toFixed(3)}`);
      }
    }

    // Aggregate
    const exact    = microAverage(sampleResults.map(r => r.exact));
    const semantic = microAverage(sampleResults.map(r => r.semantic));

    const n = sampleResults.length;
    const intrinsicMean = n > 0
      ? sampleResults.reduce((s, r) => s + r.intrinsicScore, 0) / n
      : 0;

    const intrinsicQuality = {
      mean: intrinsicMean,
      breakdown: { structural: 0, semantic: 0, factual: 0, consistency: 0 },
    };

    const extractionStats: ExtractionStats = {
      avgKgEntities:        n > 0 ? sampleResults.reduce((s, r) => s + r.kgEntityCount,   0) / n : 0,
      avgKgRelations:       n > 0 ? sampleResults.reduce((s, r) => s + r.kgRelationCount, 0) / n : 0,
      samplesWithNoRelations: sampleResults.filter(r => r.kgRelationCount === 0).length,
    };

    return {
      dataset: opts.datasetName,
      model: opts.model,
      classifier: opts.classifier,
      sampleCount: samples.length,
      exact,
      semantic,
      intrinsicQuality,
      extractionStats,
      perSample: sampleResults,
      durationMs: Date.now() - startTime,
    };
  }

  // ─── Private ─────────────────────────────────────────────────────────────

  private async processSample(sample: BenchmarkSample, systemPrompt: string): Promise<SampleResult> {
    let kg: KnowledgeGraph = { entities: [], relations: [] };

    try {
      const processedFile = this.textToProcessedFile(sample.text, sample.id);
      const graphs = await this.kgBuilder.build(processedFile, systemPrompt);
      if (graphs.length > 0) {
        kg = graphs[0];
      }
    } catch (err) {
      this.logger.warn(`Sample ${sample.id} extraction failed: ${err}`);
    }

    const extracted = this.kgToTriplets(kg);

    // Warn when a model produced entities but zero relations — F1 will be 0
    // while intrinsic quality can still look high (it evaluates kg.entities directly).
    if (kg.entities.length > 0 && kg.relations.length === 0) {
      this.logger.warn(
        `Sample ${sample.id}: model extracted ${kg.entities.length} entities but 0 relations — ` +
        `all F1 scores will be 0. Intrinsic quality still reflects entity structure.`
      );
    }

    const exact    = computeExactMetrics(extracted, sample.groundTruth, this.exactMatcher);
    const semantic = await computeSemanticMetrics(extracted, sample.groundTruth, this.semanticMatcher);

    const intrinsicScore = this.computeIntrinsicScore(kg, sample.text);

    return {
      id: sample.id,
      domain: sample.domain,
      extracted,
      groundTruth: sample.groundTruth,
      exact,
      semantic,
      intrinsicScore,
      durationMs: 0, // set by caller
      kgEntityCount:   kg.entities.length,
      kgRelationCount: kg.relations.length,
    };
  }

  private textToProcessedFile(text: string, id: string): ProcessedFile {
    return {
      path: `benchmark/${id}.txt`,
      chunks: [{
        content: text,
        index: 1,
        totalChunks: 1,
        startOffset: 0,
        endOffset: text.length,
      }],
      metadata: {},
    };
  }

  private kgToTriplets(kg: KnowledgeGraph): Triplet[] {
    return kg.relations.flatMap(r =>
      r.relationType.map(rel => ({ subject: r.from, predicate: rel, object: r.to }))
    );
  }

  private computeIntrinsicScore(kg: KnowledgeGraph, sourceText: string): number {
    // A completely empty KG (model failed entirely) should score 0, not ~74 via vacuous defaults.
    if (kg.entities.length === 0 && kg.relations.length === 0) return 0;
    try {
      const structural  = KnowledgeGraphEvaluator.calculateStructuralMetrics(kg);
      const semantic    = SemanticEvaluator.calculateSemanticMetrics(kg, sourceText);
      const factual     = FactualEvaluator.calculateFactualMetrics(kg, sourceText, 'benchmark');
      const consistency = ConsistencyEvaluator.calculateConsistencyMetrics([], kg);
      const composite   = QualityScoreCalculator.calculateCompositeScore(structural, semantic, factual, consistency);
      return composite.overallQuality;
    } catch {
      return 0;
    }
  }
}

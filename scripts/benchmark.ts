#!/usr/bin/env ts-node
/**
 * kg-gen benchmark evaluation script
 *
 * Evaluates extraction quality against external RE/KG benchmark datasets.
 * Supported datasets:
 *   - rebel   (CC BY-NC-SA 4.0)  https://huggingface.co/datasets/Babelscape/rebel-dataset
 *   - crossre  (MIT)              https://huggingface.co/datasets/DFKI-SLT/cross_re
 *
 * Usage:
 *   npm run benchmark -- --dataset crossre --data-path ./data/crossre/data.jsonl --limit 20
 */

import { Command } from 'commander';
import { ContainerFactory, TYPES } from '../src/core/di';
import { KnowledgeGraphBuilder } from '../src/core/knowledge/KnowledgeGraphBuilder';
import { PromptManager } from '../src/core/llm/prompts/PromptManager';
import { EmbeddingService } from '../src/core/llm/EmbeddingService';
import { Logger } from '../src/shared';
import { ProcessingOptions } from '../src/types';

import {
  RebelDataset,
  CrossREDataset,
  RedocredDataset,
  BenchmarkRunner,
  ConsoleReporter,
  JsonReporter,
} from '../src/evaluation';

// ─── Default ProcessingOptions for benchmark ─────────────────────────────────

function buildProcessingOptions(opts: {
  model: string;
  host: string;
  classifier: string;
  embeddingsModel: string;
  promptVersion: string;
}): Partial<ProcessingOptions> {
  return {
    model: opts.model,
    host: opts.host,
    classifier: opts.classifier as any,
    promptVersion: opts.promptVersion,
    embeddingsModel: opts.embeddingsModel,
    temperature: 0,
    repeatPenalty: 1.1,
    contextLength: 8192,
    seed: undefined,
    system: '',
    chunking: 'disabled',
    chunkSize: 4096,
    overlapSize: 0,
    images: 'disabled',
    asr: 'disabled',
    whisperModel: '',
    language: '',
    translate: false,
    retrieval: 'disabled',
    retrievalLimit: 0,
    entitySimilarityThreshold: 0.7,
    observationSimilarityThreshold: 0.7,
    enableSimilarityMerging: false,
    docling: false,
    logLevel: 'info',
    logFile: '',
    debug: false,
    silent: false,
    watch: false,
    input: 'benchmark',
    filter: ['**/*.txt'],
    exclude: [],
    output: 'benchmark-kg.json',
    description: 'Benchmark evaluation',
    dotOptions: {},
  };
}

// ─── CLI ─────────────────────────────────────────────────────────────────────

const program = new Command('benchmark');

program
  .description('Evaluate kg-gen extraction quality against benchmark datasets')
  .option('--dataset <name>',          'Dataset: rebel | crossre | redocred',                                'rebel')
  .option('--data-path <path>',        'Path to dataset file or directory (CrossRE: dir loads all splits)')
  .option('--limit <n>',               'Max number of samples to evaluate (0 = all)',                        '50')
  .option('--match-threshold <n>',     'Semantic similarity threshold for entity matching (0–1)',            '0.80')
  .option('--model <name>',            'Ollama model name',                                                  'llama3.2:3b')
  .option('--host <url>',              'Ollama host URL',                                                    'http://localhost:11434')
  .option('--embeddings-model <name>', 'Ollama embedding model',                                             'mxbai-embed-large:335m')
  .option('--classifier <mode>',       'Content classifier: disabled | heuristic | llm | bert',              'heuristic')
  .option('--prompt-version <ver>',    'Prompt template version to use (e.g. v4, v4.5)',                    'v4.5')
  .option('--domain <domains>',        'Domain filter: single (ai) or comma-separated (ai,news,science)')
  .option('--output <path>',           'Save full JSON report to this file path')
  .action(async (opts) => {
    const datasetName = opts.dataset as string;
    const limitRaw    = parseInt(opts.limit, 10);
    const limit       = limitRaw <= 0 ? Number.MAX_SAFE_INTEGER : limitRaw;
    const threshold   = parseFloat(opts.matchThreshold);
    const dataPath    = opts.dataPath as string | undefined;

    if (!dataPath) {
      console.error('Error: --data-path is required');
      process.exit(1);
    }

    // Bootstrap DI container
    const processingOptions = buildProcessingOptions({
      model: opts.model,
      host: opts.host,
      classifier: opts.classifier,
      embeddingsModel: opts.embeddingsModel,
      promptVersion: opts.promptVersion,
    });

    const container = ContainerFactory.createContainer({ processingOptions });

    const logger           = await container.resolve<Logger>(TYPES.Logger);
    const kgBuilder        = await container.resolve<KnowledgeGraphBuilder>(TYPES.KnowledgeGraphBuilder);
    const promptManager    = (await container.resolve(TYPES.PromptManager)) as PromptManager;
    const embeddingService = await container.resolve<EmbeddingService>(TYPES.EmbeddingService);

    // Load dataset
    logger.info(`Loading dataset: ${datasetName} from ${dataPath}`);
    let loader: RebelDataset | CrossREDataset | RedocredDataset;
    if (datasetName === 'rebel') {
      loader = new RebelDataset();
    } else if (datasetName === 'crossre') {
      loader = new CrossREDataset();
    } else if (datasetName === 'redocred') {
      loader = new RedocredDataset();
    } else {
      logger.error(`Unknown dataset: ${datasetName}. Supported: rebel, crossre, redocred`);
      process.exit(1);
    }

    const samples = await loader.load(dataPath, limit, opts.domain);
    logger.info(`Loaded ${samples.length} samples`);

    if (samples.length === 0) {
      logger.error('No samples loaded — check dataset path and format');
      process.exit(1);
    }

    // Run benchmark
    const runner = new BenchmarkRunner(kgBuilder as any, promptManager, embeddingService, logger, threshold);
    const result = await runner.run(samples, {
      datasetName,
      model: opts.model,
      classifier: `${opts.classifier}/${opts.promptVersion}`,
      matchThreshold: threshold,
    });

    // Report
    const consoleReporter = new ConsoleReporter();
    consoleReporter.print(result);

    if (opts.output) {
      const jsonReporter = new JsonReporter();
      jsonReporter.save(result, opts.output);
    }
  });

program.parseAsync(process.argv).catch(err => {
  console.error(err);
  process.exit(1);
});

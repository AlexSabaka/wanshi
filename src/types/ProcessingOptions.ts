
export interface ProcessingOptions {
  input: string;
  filter: string;
  output: string;
  model: string;
  chunkSize: number;
  temperature: number;
  repeatPenalty: number;
  contextLength: number;
  overlapSize: number;
  retrievalLimit: number;
  enableRetrieval: boolean;
  seed?: number;
  enableChunking: boolean;
  embeddingsModel: string;
  entitySimilarityThreshold?: number;
  observationSimilarityThreshold?: number;
  enableSimilarityMerging?: boolean;
  exportFormat?: 'json' | 'jsonl' | 'mcp-jsonl';
  system: string;
  host: string;
  logLevel: 'debug' | 'info' | 'warning' | 'error';
  logFile: string;
  watch: boolean;
  debug: boolean;
  silent: boolean;
}

import { ProcessedFile } from './IProcessingService';
import { KnowledgeGraph } from './KnowledgeGraph';
import { CorpusGlossary } from './CorpusProfile';

/**
 * A chunk whose extraction threw (after retries). It is deliberately left
 * uncheckpointed so a `--resume` re-run retries it instead of caching the
 * failure as an empty graph (KG-02).
 */
export interface FailedChunk {
  filePath: string;
  chunkIndex: number;
  totalChunks: number;
  error: string;
}

/**
 * Interface for Knowledge Graph Building services
 */

export interface IKnowledgeGraphBuilder {
  /**
   * Build knowledge graphs from processed file. An optional corpus glossary
   * steers entity naming/types when corpus profiling is enabled.
   */
  build(
    file: ProcessedFile,
    systemPrompt: string,
    retrieve?: (chunkContent: string) => Promise<any>,
    glossary?: CorpusGlossary
  ): Promise<KnowledgeGraph[]>;

  /** Chunks whose extraction failed this run (empty when all succeeded). */
  getFailedChunks(): FailedChunk[];
}

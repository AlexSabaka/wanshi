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
 * A claim (observation fact or verbalized relation triple) that the inline
 * grounding gate judged ungrounded against its source chunk (Phase 5, KG-08).
 * In `drop` mode it was removed from the graph; in `flag` mode it was annotated
 * and kept. Either way it is recorded so rejections leave a trace in the run
 * manifest rather than vanishing silently.
 */
export interface GroundingRejection {
  filePath: string;
  chunkIndex: number;
  kind: "observation" | "relation";
  /** Entity name (observation) or `from→to` (relation). */
  subject: string;
  claim: string;
  score: number;
  /** Whether the claim was removed (`drop`) or merely flagged (`flag`). */
  dropped: boolean;
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

  /** Claims the inline grounding gate rejected this run (empty when none/off). */
  getGroundingRejections(): GroundingRejection[];
}

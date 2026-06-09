/**
 * ProcessingOptions is no longer a hand-written interface — it is inferred from
 * the single source of truth, the Zod `ConfigSchema` in `src/config`. This file
 * re-exports the inferred type and its subtype aliases so existing
 * `from "../types"` imports keep working.
 *
 * The config shape is nested (see src/config/schema.ts and docs/MIGRATION.md):
 *   input · filter · exclude · output · description (top-level) and the groups
 *   llm · embeddings · chunking · retrieval · merging · grounding · corpus ·
 *   classifier · readers · export · resume · logging · runtime.
 *
 * `CorpusProfilingMode` intentionally stays defined in ./CorpusProfile (its
 * canonical home) and is not re-exported here, to avoid a duplicate export.
 */
export type {
  ProcessingOptions,
  LLMProviderMode,
  ChunkingMode,
  RetrievalMode,
  RetrievalScope,
  SpeechRecognitionMode,
  ImageProcessingMode,
  ContentClassifierMode,
  GroundingMode,
  ExportFormat,
  OutlineOptions,
} from "../config";

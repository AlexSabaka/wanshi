/**
 * Frontend mirror of wanshi's debug-trace event taxonomy
 * (src/core/trace/events.ts). Each line of `<output>.trace.jsonl` is a
 * {@link TraceRecord} — an event payload plus the writer's envelope. Kept in
 * sync with the core by `TRACE_VERSION`; the loader warns on a mismatch.
 */
export const TRACE_VERSION = 1

export type TraceStage = "run" | "ingest" | "classify" | "extract" | "ground" | "merge" | "export"

/** Envelope stamped by the writer onto every emitted event. */
export interface TraceEnvelope {
  v: number
  runId: string
  ts: string // ISO-8601
  seq: number // monotonic per run
}

export interface RunStartEvent {
  stage: "run"
  type: "run_start"
  output: string
  /** A resumed run skips checkpointed chunks, so its trace is partial. */
  resumed: boolean
  config?: Record<string, unknown>
}

export interface ChunkEvent {
  stage: "ingest"
  type: "chunk"
  chunkId: string // `<relPath>#<index>`
  file: string
  chunkIndex: number
  totalChunks: number
  reader: string
  contentLength: number
  provenance?: Record<string, unknown>
}

export interface ClassificationEvent {
  stage: "classify"
  type: "classification"
  file: string
  distribution: Array<{ class: string; confidence: number }>
  gate: "abstain" | "single" | "multi"
  activeClasses: string[]
  escalated: boolean
  tieBreak?: { tied: [string, string]; pick: string | null }
}

export interface EntityMentionRef {
  mentionId: string
  name: string
  entityType: string
  observationIds: string[]
}

export interface RelationMentionRef {
  mentionId: string
  from: string
  to: string
  relationType: string[]
}

export interface ExtractionEvent {
  stage: "extract"
  type: "extraction"
  extractionId: string // `<chunkId>@<attempt>`
  chunkId: string
  file: string
  chunkIndex: number
  model: string
  promptVersion: string
  attempt: number
  checkpointHit: boolean
  entityMentions: EntityMentionRef[]
  relationMentions: RelationMentionRef[]
  usage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number }
  failed?: boolean
  error?: string
}

export interface GroundingEvent {
  stage: "ground"
  type: "grounding"
  extractionId: string
  chunkId: string
  mentionId?: string
  kind: "observation" | "relation"
  subject: string // entity name, or `from→to`
  claim: string
  score: number
  checker: string // "keyword" | "minicheck"
  decision: "accept" | "flag" | "drop"
}

export interface MergeDecisionEvent {
  stage: "merge"
  type: "merge_decision"
  mergeDecisionId: string
  target: "entity" | "relation"
  canonical: string
  surfaceForms: string[]
  /** Pre-merge mention IDs that fold into the canonical node (lineage thread). */
  foldedMentionIds?: string[]
  cosine?: number
  jaroWinkler?: number
  method: string // "string-exact" | "string-jw" | "embeddings" | "llm" | "hybrid"
  verdict: "accept" | "reject"
  adjudicated?: boolean
  adjudicatorVerdict?: boolean
  digitVeto?: boolean
}

export interface ExportEvent {
  stage: "export"
  type: "export"
  format: string
  entities: number
  relations: number
  droppedByGate?: number
}

export type TraceEvent =
  | RunStartEvent
  | ChunkEvent
  | ClassificationEvent
  | ExtractionEvent
  | GroundingEvent
  | MergeDecisionEvent
  | ExportEvent

export type TraceRecord = TraceEvent & TraceEnvelope

// --- narrowing helpers (the inspector filters a flat record stream) ---------

export const isRunStart = (r: TraceRecord): r is RunStartEvent & TraceEnvelope => r.type === "run_start"
export const isChunk = (r: TraceRecord): r is ChunkEvent & TraceEnvelope => r.type === "chunk"
export const isClassification = (r: TraceRecord): r is ClassificationEvent & TraceEnvelope =>
  r.type === "classification"
export const isExtraction = (r: TraceRecord): r is ExtractionEvent & TraceEnvelope => r.type === "extraction"
export const isGrounding = (r: TraceRecord): r is GroundingEvent & TraceEnvelope => r.type === "grounding"
export const isMergeDecision = (r: TraceRecord): r is MergeDecisionEvent & TraceEnvelope =>
  r.type === "merge_decision"
export const isExport = (r: TraceRecord): r is ExportEvent & TraceEnvelope => r.type === "export"

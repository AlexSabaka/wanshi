/**
 * Reconstruct a node's lineage from a flat `trace.jsonl` record stream — PURE,
 * no React. The mention-instance IDs are embedded in the events themselves
 * (`${extractionId}|e|${name}`) and merge folds are re-serialized into
 * `MergeDecisionEvent.foldedMentionIds`, so the sidecar alone carries everything
 * needed to rebuild chunk → extraction → grounding → merge for any node — the
 * in-run `LineageRegistry` is a build-time convenience we don't need here.
 *
 * Sharp edges handled: a never-merged entity emits no merge event (index by
 * name, don't assume one); a grounding `subject` is dual-keyed (entity name for
 * observations, `from→to` for relations); a resumed run's trace is partial
 * (checkpoint-hit extractions may not re-emit) — surfaced, not hidden.
 */
import {
  isChunk,
  isExtraction,
  isGrounding,
  isMergeDecision,
  isRunStart,
  type ChunkEvent,
  type ExtractionEvent,
  type GroundingEvent,
  type MergeDecisionEvent,
  type TraceEnvelope,
  type TraceRecord,
} from "@/lib/trace"

type Env<T> = T & TraceEnvelope

export interface TraceEntitySummary {
  /** Canonical name (post-merge). */
  name: string
  entityType: string
  mentionCount: number
  chunkCount: number
  /** Pre-merge surface forms that fold into this canonical name. */
  surfaceForms: string[]
}

export interface NodeLineage {
  name: string
  surfaceForms: string[]
  chunks: Env<ChunkEvent>[]
  extractions: Env<ExtractionEvent>[]
  grounding: Env<GroundingEvent>[]
  merges: Env<MergeDecisionEvent>[]
  /** A resumed run / checkpoint-hit extractions ⇒ the lineage is incomplete. */
  partial: boolean
}

interface TraceIndex {
  runStartResumed: boolean
  chunks: Env<ChunkEvent>[]
  extractions: Env<ExtractionEvent>[]
  grounding: Env<GroundingEvent>[]
  merges: Env<MergeDecisionEvent>[]
  chunkById: Map<string, Env<ChunkEvent>>
  /** surface form → canonical (transitive). */
  canonicalOf: Map<string, string>
}

/** Resolve a surface form to its canonical name through chained merges. */
function buildCanonicalMap(merges: Env<MergeDecisionEvent>[]): Map<string, string> {
  const parent = new Map<string, string>()
  for (const m of merges) {
    if (m.target !== "entity" || m.verdict !== "accept") continue
    for (const sf of m.surfaceForms) if (sf !== m.canonical) parent.set(sf, m.canonical)
  }
  const resolve = (n: string, guard = 0): string => {
    const p = parent.get(n)
    return !p || p === n || guard > 50 ? n : resolve(p, guard + 1)
  }
  const out = new Map<string, string>()
  for (const n of parent.keys()) out.set(n, resolve(n))
  return out
}

export function indexTrace(records: TraceRecord[]): TraceIndex {
  const chunks: Env<ChunkEvent>[] = []
  const extractions: Env<ExtractionEvent>[] = []
  const grounding: Env<GroundingEvent>[] = []
  const merges: Env<MergeDecisionEvent>[] = []
  let runStartResumed = false

  for (const r of records) {
    if (isRunStart(r)) runStartResumed = runStartResumed || r.resumed
    else if (isChunk(r)) chunks.push(r)
    else if (isExtraction(r)) extractions.push(r)
    else if (isGrounding(r)) grounding.push(r)
    else if (isMergeDecision(r)) merges.push(r)
  }

  const chunkById = new Map(chunks.map((c) => [c.chunkId, c]))
  const canonicalOf = buildCanonicalMap(merges)
  return { runStartResumed, chunks, extractions, grounding, merges, chunkById, canonicalOf }
}

const canon = (idx: TraceIndex, name: string) => idx.canonicalOf.get(name) ?? name

/** Endpoints of a relation grounding `subject` (`from→to`). */
function relationEndpoints(subject: string): string[] {
  return subject.split("→").map((s) => s.trim())
}

/** Group every extraction mention into canonical-named entities (the pick list). */
export function listTraceEntities(records: TraceRecord[]): TraceEntitySummary[] {
  const idx = indexTrace(records)
  const acc = new Map<
    string,
    { entityType: string; mentions: number; chunks: Set<string>; forms: Set<string> }
  >()
  for (const ex of idx.extractions) {
    for (const m of ex.entityMentions) {
      const c = canon(idx, m.name)
      const cur = acc.get(c) ?? { entityType: m.entityType, mentions: 0, chunks: new Set(), forms: new Set() }
      cur.mentions++
      cur.chunks.add(ex.chunkId)
      cur.forms.add(m.name)
      acc.set(c, cur)
    }
  }
  // Merge-only traces (e.g. a canon/adjudication experiment) carry no extraction
  // events — surface entities from the merge decisions too, so the inspector still
  // has a pick list and the merge lineage is reachable.
  for (const m of idx.merges) {
    if (m.target !== "entity") continue
    for (const nm of [m.canonical, ...m.surfaceForms]) {
      const c = canon(idx, nm)
      const cur = acc.get(c) ?? {
        entityType: "entity",
        mentions: 0,
        chunks: new Set<string>(),
        forms: new Set<string>(),
      }
      cur.forms.add(nm)
      acc.set(c, cur)
    }
  }
  return [...acc.entries()]
    .map(([name, v]) => ({
      name,
      entityType: v.entityType,
      mentionCount: v.mentions,
      chunkCount: v.chunks.size,
      surfaceForms: [...v.forms].sort(),
    }))
    .sort((a, b) => b.mentionCount - a.mentionCount || a.name.localeCompare(b.name))
}

/** Reconstruct the full lineage for one canonical entity name. */
export function reconstructLineage(records: TraceRecord[], target: string): NodeLineage {
  const idx = indexTrace(records)
  const surfaceForms = new Set<string>([target])

  // mentionIds belonging to the target (by canonical name).
  const targetMentionIds = new Set<string>()
  const extractionIds = new Set<string>()
  for (const ex of idx.extractions) {
    for (const m of ex.entityMentions) {
      if (canon(idx, m.name) === target) {
        surfaceForms.add(m.name)
        targetMentionIds.add(m.mentionId)
        extractionIds.add(ex.extractionId)
      }
    }
  }

  const extractions = idx.extractions.filter((e) => extractionIds.has(e.extractionId))
  const chunkIds = new Set(extractions.map((e) => e.chunkId))
  const chunks = [...chunkIds].map((cid) => idx.chunkById.get(cid)).filter((c): c is Env<ChunkEvent> => !!c)

  const grounding = idx.grounding.filter((g) => {
    if (g.mentionId && targetMentionIds.has(g.mentionId)) return true
    if (g.kind === "observation") return canon(idx, g.subject) === target
    return relationEndpoints(g.subject).some((e) => canon(idx, e) === target)
  })

  const merges = idx.merges.filter((m) => {
    if (canon(idx, m.canonical) === target) return true
    if (m.surfaceForms.some((sf) => canon(idx, sf) === target)) return true
    return (m.foldedMentionIds ?? []).some((id) => targetMentionIds.has(id))
  })

  const partial = idx.runStartResumed || extractions.some((e) => e.checkpointHit)

  return {
    name: target,
    surfaceForms: [...surfaceForms].sort(),
    chunks: chunks.sort((a, b) => a.seq - b.seq),
    extractions: extractions.sort((a, b) => a.seq - b.seq),
    grounding: grounding.sort((a, b) => a.seq - b.seq),
    merges: merges.sort((a, b) => a.seq - b.seq),
    partial,
  }
}

/** Event counts per stage — the trace summary header. */
export function stageCounts(records: TraceRecord[]): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const r of records) counts[r.stage] = (counts[r.stage] ?? 0) + 1
  return counts
}

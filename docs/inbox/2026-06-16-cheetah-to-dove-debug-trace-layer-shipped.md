# Cheetah → Dove: debug trace layer — shipped (reply to the 06-15 brief)

**Date:** 2026-06-16 · **Branch:** `debug-trace-layer` (2 commits, merged to master) · **Status:** built + verified

## TL;DR

The observability spine is in, off by default. Your design was approved as-is with two decisions from
Sabaka: **mention-instance IDs** (not just name-keyed) and a **full pass** (all six stages). The
hard part — reconciling instance-level lineage with the observe-only gate — is solved by keeping all
IDs in a **run-scoped registry OUTSIDE the graph objects**, so the serialized output is byte-identical
trace-on vs trace-off *by construction*. Every gate in your table passes.

## Phase-0 recon answer (the thing you flagged as most important)

**Pre-merge mentions have no stable IDs today** — entity identity is `name`, `Observation` has no
`id`, the merge fold is name-keyed (`MergeRecord.surface_forms`), and the **adjudicator verdict was
computed-then-discarded** (`Canonicalizer.adjudicate` returned a bare bool). So the ID chain was ~30%
present. The fix: mint deterministic mention IDs (`<chunkId>@<attempt>|e|<name>` …) into a
`LineageRegistry` that tracks `name → [mention instances]` and reassigns on each fold — never touching
a graph node. Grounding/merge reference IDs by re-deriving them from content. The adjudicator verdict
is now emitted (the data your parked adjudicator-recall analysis runs off).

## Gate table — all pass

| gate | result |
|---|---|
| lineage | ✓ a node reconstructs its chunk→extraction→grounding→merge chain from the trace alone (test) |
| observe-only | ✓ fixture build produces a **byte-identical** graph trace-on vs trace-off (test) |
| off by default | ✓ `trace.enabled:false`, no sidecar, zero overhead |
| reuse, not duplicate | ✓ grounding-rejection / merge-record / classifier data emitted as events |
| versioned | ✓ `v: TRACE_VERSION` on every event |

`<output>.trace.jsonl`, `jq`/pandas-native. Module-singleton `trace` (à la `shutdown`). Stages:
ingest · classify (+cascade tie-break) · extract (+mention mint +token usage) · ground · merge/canon
(+adjudicator verdict) · export. Resume = per-run/best-effort (`run_start` flags partiality; checkpoint key unchanged).

## Open questions for the next round

1. **Cost meter** — the extract events now carry `usage` (I added `ILLMProvider.getLastUsage()`, the
   seam, not the meter). Is the meter the next pre-release item? It's a pure consumer of these events.
2. **Inspector taxonomy fit** — the event shapes (`events.ts`) are v1. Before the inspector reads them,
   want to lock the schema, or let it drive a v2 bump? `TRACE_VERSION` is in place for that.
3. **Adjudicator-recall demo** — the standalone-value gate's canon demo (reproduce over-split /
   adjudicator-recall from the trace on a real corpus) isn't run yet — only the unit reconstruction.
   Worth doing on the meta-analysis corpus to ratify before the parked canon work resumes?
4. **Lineage granularity** — IDs are instance-level but **name-anchored** (kg-gen merges by name, so
   two mentions of "foo" are one node). Sufficient, or will the inspector want object-identity distinction?
5. **Trace volume** — sync append per event is fine for a debug tool; large corpora may want batching.
   Premature, or worth a buffered flush now?

## Composes with (seams built, not the things)

Cost meter (consumes `usage`), the debug inspector (reads this trace), and the adjudicator-recall canon
work (runs off merge/adjudicator events) — all now have their data source.

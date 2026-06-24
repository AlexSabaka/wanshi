# Brief — debug/observability trace layer (the structured run-trace)

**From:** Dove 🕊️ · **To:** Cheetah 🐆 · **Date:** 2026-06-15
**Type:** design brief (the observability spine; first pre-Phase-10 item). **No code yet** — this is
the design pass to approve before build.
**Why first:** of the pre-release track it's the only item with standalone value *and* a gating role —
it speeds the current canon research (adjudicator-recall, over-split clusters) **this month**, and it's
the prerequisite for the debug inspector later. Emit the data; the UI is just a reader of it.

## What it is — and four things it is NOT
A **structured, append-only run-trace**: the complete decision lineage of a single extraction run,
emitted as a first-class artifact (like the graph and the checkpoint), queryable by your existing
bash/Python tooling today and by the debug inspector later.

- **NOT logging.** The logger is human-readable stderr; the trace is machine-structured, complete, and
  correlated. Different artifact, different consumer.
- **NOT evaluation.** No labels, no scoring against gold (that's the A3 harness / the evaluators). The
  trace records *what happened*; an analysis reads it.
- **NOT the UI.** It's the data the inspector will consume; its value is immediate via `jq`/pandas.
- **NOT a behavior change.** Pure observation — emitting a trace must never alter an extraction, merge,
  grounding, or classification outcome. No observer effect. (This is a hard gate.)

## Thesis (one sentence)
A single `TraceWriter` (DI service) threads `trace.emit(event)` calls through the pipeline's decision
points, writing a versioned JSONL sidecar with **correlation IDs** that let you reconstruct the full
lineage of any final graph node — off by default, observe-only, reusing the grounding-rejection /
merge-log / classifier-decision data the stages already produce.

## What it captures — event taxonomy by stage
The stages that *make decisions* worth inspecting:

1. **Ingest** — file → reader dispatch (which reader matched), chunk boundaries, attached provenance
   (`ChunkResult`). Cheap; the spine for everything downstream.
2. **Classify** — the just-shipped cascade: the softmax distribution, the gate decision
   (`abstain`/`single`/`multi`), whether escalation fired + its tie-break result, the partial routed.
   (Directly from `mergeChunkClassifications` + the cascade tier.)
3. **Extract** — per-chunk LLM call: prompt version, raw model output, parsed entities/relations,
   retries/failures, **and token usage** (this is the seam where the trace composes with the
   cost-metering item — extraction events carry the `usage` the meter tallies).
4. **Ground** — per-claim: keyword pre-filter score, escalated to MiniCheck or not, MiniCheck score,
   `accept`/`flag`/`drop`. (Reuses `getGroundingRejections()`.)
5. **Merge / canon** — per *interesting* pair: cosine, `decide` outcome (accept/escalate/reject),
   adjudicator verdict, digit-veto fires. (Reuses the merge logs — and this is the event class that
   directly serves the parked top-canon item: adjudicator-recall analysis runs off these.)
6. **Export** — which entities/relations survived; export-time filtering (e.g. the `lora` grounding
   gate dropping sub-threshold facts).

## The lineage thread (the design crux)
The headline capability is *"pick any final node/edge → reconstruct its whole chain."* That requires
**stable correlation IDs threaded across stages**, distributed-tracing style:

- `runId` → `chunkId` (file+index) → `extractionId` (the LLM call) → raw entity/relation **mention IDs**
  → canonical `entityId`/`edgeId` after merge. Each event references its parent ID(s).
- A merge event records *which pre-merge mentions/nodes folded into* the canonical node (+ the
  `mergeDecisionId`, cosine, verdict). Grounding events reference the claim + its `extractionId`.
- Lineage of canonical entity X = filter trace by `entityId == X` across event types → it merged from
  mentions {m1 (extraction e1, chunk c3), m2 (e2, c7)} via decision d12 (cosine 0.81, adjudicator
  accept), each mention grounded at score s. **This join is the whole feature.**

Without the ID thread you have disconnected per-stage logs, not a lineage. Defining the ID scheme +
parent refs is the thing to get right in the design phase.

## Design forks to resolve (Phase 1)
1. **Always-on vs opt-in, and pairwise volume.** Recommend **opt-in** (`trace.enabled`, default off) —
   it has overhead + size and is a debug/research tool. When on, it should be **complete** (sampling
   can't explain a specific node). BUT bound the O(n²) canon stage: emit merge events only for pairs
   that were **actually adjudicated / escalated / vetoed** (the interesting ones), not every eligible
   pair. Confirm that's sufficient for the adjudicator-recall analysis (it should be — that analysis
   cares about the decided pairs).
2. **Format/storage.** Recommend **append-only JSONL sidecar** (`<output>.trace.jsonl`) — matches the
   `.jsonl`/checkpoint idiom, streamable, crash-safe (append), `jq`/pandas-native, offline-first. Note
   SQLite as a *later* upgrade if indexed queries are wanted (Phase-11-ish), but the raw emit is JSONL.
3. **One writer vs parallel paths.** Recommend a **single `TraceWriter`** with a typed event API; each
   stage calls `emit` at its decision points, and the existing rejection/merge-log/classifier data
   become specific event types. Do **not** bolt a second logging path beside the logger.
4. **Resume interaction.** A resumed run skips done chunks, so its trace would be partial. Recommend:
   trace is **per-run / best-effort** (debug runs use `--trace` on a fresh run), and flag the partiality
   rather than engineering a cross-run union now. Confirm the checkpoint key need not change.
5. **Schema versioning.** Stamp a `traceVersion` on every event (same discipline as the checkpoint key /
   prompt version) so the future inspector doesn't break as events evolve.

## Phase 0 — seam recon (label CONFIRMED/INFERRED/UNVERIFIED, cite file:line)
1. Each stage's decision point + what it *already* emits: `getGroundingRejections()`, the merge logs,
   the cascade's classification result, the per-chunk extraction path. Which already carry structured
   data vs. only log lines?
2. **Do pre-merge entities/mentions have stable IDs today?** This gates the lineage thread. If the
   `KnowledgeMerger` already tracks merge provenance (it has merge logs), how much of the ID chain
   exists vs. needs adding? **Most important recon question.**
3. The DI seam for a `TraceWriter` (singleton, à la the shutdown/gate-threshold modules) and how it
   reaches each stage without re-plumbing.
4. Where extraction token usage is available to attach to extract events (the cost-metering seam).

## Phases (sub-steps may parallelize)
- **1 — schema + ID design.** Event taxonomy, correlation-ID scheme + parent refs, JSONL shape,
  versioning. The deliverable to approve before build.
- **2 — `TraceWriter` + emit threading.** Start with stages that already have hooks (ground, merge,
  classify), then extract (+usage), then ingest/export. Existing rejection/merge data → event types.
- **3 — validate via standalone use.** Point existing bash/Python at the trace: (a) reconstruct one
  final node's full lineage from the trace alone; (b) reproduce a real **over-split / adjudicator-recall
  analysis** from the trace file, matching what scraping the live graph produces today.

## Verification gate (passes iff)
| gate | pass condition |
|---|---|
| **lineage** | any final entity/edge reconstructs its full chain (chunk → extraction → grounding → merge decisions) from the trace alone |
| **standalone value** | a real canon analysis (over-split clusters / adjudicator-recall on code) is reproducible from the trace, matching the current live-graph scraping |
| **observe-only** | with trace on, extraction/merge/grounding/classification outcomes are byte-identical to trace-off (no observer effect) |
| **off by default** | `trace.enabled:false` ⇒ zero overhead, default run unchanged |
| **reuse, not duplicate** | grounding-rejection / merge-log / classifier-decision data are emitted as trace events, not via a parallel logger path |
| **versioned** | every event carries `traceVersion` |

## Composes with (note, don't build here)
- **Cost metering** (next pre-release item): extract events carry token `usage`; the meter is a
  consumer of those events. Build the seam, not the meter.
- **The debug inspector** (decoupled UI track): it's a *reader* of this trace. This brief is its hard
  prerequisite.
- **The parked adjudicator-recall canon work**: runs off the merge/adjudication events — so this trace
  makes the top canon item easier the moment it lands.

## Out of scope
- The debug UI itself (separate track, gated on this).
- Any behavior change to a pipeline stage (pure instrumentation — observe-only).
- Evaluation/scoring against labels (the A3 harness / evaluators own that).
- The cost meter proper (its own pre-release brief — this only exposes the usage seam).
- Cross-run trace union for resumed runs (flagged partial; revisit if needed).

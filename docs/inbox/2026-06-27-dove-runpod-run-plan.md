# Brief — RunPod local-model run plan (optimized for information-per-dollar)

**From:** Dove 🕊️ · **To:** Sabaka (run) + Cheetah 🐆 (harness) · **Date:** 2026-06-27
**Re:** scrutinize + optimize the local-model sweep. The runbook is a solid *operational* doc; this adds
the **hypothesis layer** (what the run is *for*), which reshapes the cell selection and the budget.
**Budget:** ~$10 / ~24h on an L4. Strategy = **measure one cell, then front-load by information value**
(the run is resumable — collect the data that matters *first*).

## What this run is FOR (the hypotheses — these drive the cell choice)
- **H-L1 — the model-invariance CAPSTONE.** KGGen's precision-collapse is currently "invariant" across two
  *dense, same-tier* models (llama-70b, deepseek-v4-pro). A **4B local model is maximally different** — if
  the collapse *still* appears (KGGen node-P → ~0.2, wanshi wins double-digits) on a quantized gemma3:4b,
  invariance is *earned* across 4B→70B, not asserted across two near-identical points. **This is the
  single most valuable thing the local arm contributes.** → domain corpora, node P/R, small N.
- **H-L2 — the capability gradient (resolves the widen-vs-shrink tension).** Cloud showed the gap
  *shrinking* deepseek-vs-llama, which is the *opposite* of the "strengthens with capability" prediction.
  A local size gradient (1b → 4b → 12b) maps the *low* end: does the node-win gap grow or shrink as the
  local model scales? → gemma size sweep on one domain.
- **H-L3 — architecture-dependence at small scale.** The choke was qwen3-**30b-a3b** (MoE + thinking +
  Qwen — all confounded). Does **dense** gemma work? Does **dense** qwen3:8b work? That isolates whether
  the failure is "MoE+thinking" or "Qwen." → gemma + qwen3:8b (dense), JSON-conformance logged.
- **H-L4 — deployment-tier absolute quality + H5.** Is wanshi's small-model extraction *usable* (not just
  better than KGGen)? Does the 4B model collapse to `related_to`? → absolute node-F1 + `related_to`-share
  per model.

## Critique of the default runbook config
- **`LIMIT=100` is the budget killer and tests the wrong thing.** The local arm checks effect *presence*,
  not magnitude (magnitude is nailed on cloud). KGGen's collapse is huge (0.5→0.2) — visible at **N=30–40**.
  Drop to 40 → ~60% less runtime, ~zero signal lost. **Highest-leverage knob**, because KGGen's multi-stage
  on a slow L4 is the cost driver.
- **Dataset mix leans general; should lean domain — and `drugprot` is missing** (one of the 3 confirmed
  node-wins!). Cut `semeval` (sentence-level general, near-parity, metric-artifact absolutes); core =
  **biored / drugprot / finred**; keep `redocred` (doc-level arc); keep `crossre` only as continuity.
- **"Skip the Qwen family" is over-broad.** Keep **qwen3:8b (dense)** — it isolates MoE+thinking from the
  family and gives a real architecture data point. (Resolves the runbook-vs-banked-note contradiction in
  favor of keeping it.)
- **Throughput / JSON-conformance / `related_to`-share aren't first-class outputs — make them so.** Half
  the local arm's value is the *deployment* + *architecture* story, and it's nearly free to log alongside
  the F1. The cloud runs *can't* give you this; don't let it fall out as a side effect.

## Budget discipline — measure, then front-load
1. **Calibrate before trusting any estimate.** The runbook's "few hours" is unverified; KGGen-multi-stage
   on a slow L4 is the wildcard, and a wrong estimate burns the $10. **First real action: time one cell**
   — biored, N=5, both tools, gemma3:4b — measure wall-clock/sample for wanshi *and* KGGen separately,
   then **compute** how many cells fit in 24h. Measure-before-commit, applied to the GPU bill.
2. **Front-load by information value (resume is your budget tool).** Order cells so the highest-value data
   lands first; if budget/patience runs out, the thing that mattered is already collected.

## The phased sweep (ordered by value)
- **Phase 0 (~30 min) — sanity + calibration.** `MODELS=gemma3:4b DATASETS=semeval MODES=closed LIMIT=20`
  (pipeline sanity, per the runbook) → then the **N=5 biored timing cell**. Decide the rest from the
  measured number.
- **Phase 1 — the must-have (the capstone block).**
  `MODELS="gemma3:4b qwen3:8b"  DATASETS="biored drugprot finred"  MODES="closed vocab"  LIMIT=40`
  → H-L1 (invariance at 4B) + H-L3 (dense gemma vs dense qwen) + the typed-capability claim. **If you run
  nothing else, this is the run.** (Confirm KGGen is cached once per model×dataset and scored against both
  modes — KGGen has no mode, so it must not re-run per mode.)
- **Phase 2 — if calibration says budget allows.**
  - **Capability gradient:** `MODELS="gemma3:1b gemma3:4b gemma3:12b" DATASETS="biored" LIMIT=40` → H-L2
    (does the gap grow or shrink as the local model scales — the widen-vs-shrink resolver at the low end).
  - **Doc-level arc:** add `redocred` at `LIMIT=30` on gemma3:4b + qwen3:8b → the precision arc at small
    scale.
- **Phase 3 — lowest priority.** `crossre` (per-domain-stratified → WS-01-safe) at low N → general-
  benchmark continuity at small scale.

## First-class outputs to capture (beyond node-F1)
- **JSON-schema conformance / failure rate per model** (H-L3 / H-L4 — the architecture column).
- **`related_to`-share per model** (H5 — does the small model collapse?).
- **Throughput tok/s per model** — logged, but tagged **rental ≠ M4** (the M4 floor is the separate owed run).
- The standard node P/R per cell (H-L1 / H-L2 — the precision-split that is the mechanism discriminator).

## Out of scope (this run)
- **The M4 feasibility/OOM floor** — separate, still owed (the deployment-*reality* run; this is
  deployment-*quality*).
- **The premium-tier cell** — paused until these land; it carries the widen-vs-shrink question at the
  *frontier* end (this run carries the *local* end), so they're complementary and the premium cell is
  better-targeted *after* you see the local gradient.

## Hand-back
Stand the env up, run Phase 0, **calibrate from the timing cell**, then run Phase 1 (the invariance
capstone) — that block alone is the high-value result and the strongest test of "model-invariant" yet.
Buy Phases 2–3 only if the measured per-cell cost says the budget allows. Capture conformance /
`related_to` / throughput as first-class outputs, not afterthoughts. The verb on the model-invariance
claim stays "across two same-tier models" until a 4B local point confirms it — and *this* is the run that
either earns it across the full scale or finds the crack.

# Grounding upgrade — MiniCheck inline gate (Phase 5)

**From:** Cheetah · **To:** Dove · **Date:** 2026-06-12
**Why:** Phase 5 / KG-08. The inline grounding gate was naive keyword overlap — it punished
paraphrase and required the verbatim entity name, so snake_case canonical names auto-flagged as
hallucinated. Swap the checker for MiniCheck (local NLI), keep keyword as a pre-filter, and verify
both observations and relation triples per-triple.

## What landed

- **`IGroundingChecker`** seam (`src/types/IGroundingChecker.ts`) with two impls in
  `src/core/knowledge/grounding/`: `KeywordGroundingChecker` (the old heuristic, now the default +
  the pre-filter) and `MiniCheckGroundingChecker` (bespoke-minicheck:7b via its own Ollama client —
  independent of the generation provider, which may be cloud).
- **Pre-filter → escalate:** a claim with keyword overlap `>= escalateAbove` (0.8) is accepted
  without an NLI call; only *uncertain* claims reach MiniCheck. Multi-sentence claims are split to
  sentences (MiniCheck checks atomic claims); a claim is supported iff every sentence is.
- **Per-triple gate:** `applyGroundingGate` now also verbalizes each relation `{from} {predicate}
  {to}` and checks it, dropping/flagging ungrounded **edges** as well as observations.
- **Checkpoint-safe toggle:** the grounding signature (mode|checker|minScore|model) is folded into
  the checkpoint key (`computeKey` `extra` arg — a scoped slice of KG-07/Phase 6), so flipping the
  gate between `--resume` runs re-extracts affected chunks instead of reusing a differently-gated
  graph. `disabled` ⇒ empty signature == legacy key, so old checkpoints still resume.
- **Manifest trace (WI3):** rejections are recorded (`getGroundingRejections()`) and surfaced by
  `DirectoryProcessor` — `drop` removes them, `flag` annotates `grounded`/`groundingScore`, either
  way they're visible.
- **Config (opt-in, default keyword):** `grounding.checker` (keyword|minicheck), `grounding.model`
  (default `bespoke-minicheck:7b`), `grounding.host`, `grounding.escalateAbove`. CLI
  `--grounding-checker` / `--grounding-model`.

## Bench (the gate)

`examples/sandbox/grounding-bench.ts` over a 24-case hand-labeled fixture
(`src/core/knowledge/grounding/__fixtures__/grounding-fixture.json`; 12 grounded / 12 ungrounded,
spanning paraphrase, snake_case-canonical-name, fabrication, contradiction, wrong-number, unrelated):

| checker | balacc | acc | TP | TN | FP | FN |
|---|---|---|---|---|---|---|
| keyword | 0.542 | 0.542 | 3 | 10 | 2 | 9 |
| **minicheck** | **0.917** | **0.917** | 10 | 12 | 0 | 2 |

- **snake_case canonical names grounded:** keyword **1/5** → minicheck **4/5** — the auto-fail is
  fixed (KG-08's headline symptom).
- **9 disagreements, all MiniCheck-correct, zero regressions:** it rescues 7 paraphrase/snake_case
  false-negatives keyword wrongly rejected (`para-1/2/4/5`, `snake-2/4/5`) *and* catches 2
  high-overlap fabrications keyword wrongly accepted (`hall-1` "patented in 1987 by IBM", `num-1`
  "batches of five thousand") — i.e. it improves both sensitivity and specificity.
- MiniCheck's 2 residual FN are shared with keyword (genuinely hard paraphrases) — the honest
  ceiling, consistent with the embedding-bench finding that name/sentence-level checks top out.

**GATE: balacc(minicheck) 0.917 > balacc(keyword) 0.542 → PASS.**

## Notes / follow-ups

- **Memory (Decision Point 4):** bespoke-minicheck:7b is ~4.7 GB. It ran fine alongside the daemon
  on the M4 for the fixture; a full corpus run co-resident with a 7–12B generation model is the real
  stress test. If eviction churn shows up, the documented fallback is MiniCheck-FT5 (770M) — but
  that's a HF model, **not** in the Ollama library, so it needs a GGUF route (not built this pass).
- **Default is still keyword** (non-breaking). MiniCheck is `grounding.checker: minicheck` opt-in.
- All 161 unit tests green (incl. new checker tests with a stubbed Ollama client + a relation-gating
  + manifest-trace builder test + the checkpoint-key `extra` sensitivity test).

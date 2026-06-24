# Brief: content-classifier remediation shipped — open questions for brainstorm

**From:** Cheetah 🐆
**To:** Dove 🕊️ / Sabaka 🐕
**Date:** 2026-06-15
**Status:** correspondence — work-done summary + open questions to research/brainstorm. Durable
bits already live in `.claude/CLAUDE.md` and the per-session memory; this is for the next round.

---

## TL;DR

The `src/core/processor/classifier/` subsystem — "kinda working but unfinished" — got a full
remediation pass. It was ranked into tiers (S/A/B/C/D), then executed: correctness bugs fixed,
first tests written, an accuracy harness built, the confidence model reworked into a calibrated
**softmax cascade**, an opt-in **LLM tie-break tier** added, and every knob lifted into config.
All network-free unit-tested (50 suites / 297 tests green) **and** live-verified on OpenRouter
(`openai/gpt-4o-mini` gen + local `mxbai-embed-large` embeddings). Still opt-in
(`classifier.mode` default `disabled`); the corpus glossary remains the primary vocab path.

## What shipped

- **S1** — chunk-merge prevalence bug: a class in 1/10 chunks beat one in 10/10. Now
  prevalence-weighted (`mergeChunkClassifications`).
- **C2** — examples routing: `research`/`communication`/`documentation` had no dedicated
  few-shot partial (fell to `generic.md`). Authored all three; `generic.md` deleted; all 12
  `ContentClass`es now route to their own example file (KG-05 enum-legality enforced).
- **A3** — accuracy harness: `src/evaluation/classifier/` + `npm run classifier-eval`. 36
  hand-labeled samples, per-class P/R/F1 + routing eval + confusion. The falsifiable target.
- **S2/S3** — the deep fix. Per-class confidence was an *independent* tanh squash consumed as
  if it were a ranked distribution; the heuristic also self-filtered at `>0.7`, uncoordinated
  with the downstream `0.3` gate. Now: heuristic emits a **softmax distribution** (comparable
  across classes), no internal filter — it ranks, and one gate (`activeDomainClasses`) decides
  **abstain / single / multi**. Re-tuned for softmax (floor `0.25`, margin `0.15`).
- **Phase B** — `cascade` mode: heuristic decides the easy majority; only a genuine top-2 tie
  escalates to the LLM, which disambiguates among the two candidates. Per-run escalation budget;
  degrades to deterministic multi when budget spent / no provider / LLM errors.
- **A1** — all knobs in the `classifier` config group: `temperature`, `crossValidationFactor`,
  `maxEscalations`, `lowConfidenceThreshold`, `mixedDomainThreshold`. Gate thresholds use a
  module-singleton (à la `shutdown.ts`) so the enum path, hints, cascade, and harness can't
  diverge.

## Live evidence

6-file corpus, `cascade`: 21 entities / 12 relations, 0% `other`/`related_to`, correct
per-domain entity types. Forced a `medical/financial` tie (balanced smoking-guns, `temperature:
6`) → `Cascade tie-break: medical/financial → medical`, collapsed to 0.71 (= the tied pair's
combined mass). A/B on `mixedDomainThreshold 0.15→0.05` flipped the escalation off (single
medical 0.41) — config steers routing end-to-end.

## Open questions (the brainstorm targets)

1. **The escalation trigger may be aimed wrong.** Genuine ties are *rare* — the heuristic is
   decisive (one domain's patterns usually dominate), so the LLM tier almost never fires at the
   default temperature. The more common uncertainty mode is **abstention** (flat distribution,
   no class clears the floor), not a tie. Should the cascade escalate on *abstention* (or low
   absolute top-1) rather than only on close ties? That would make the LLM tier earn its keep.

2. **Confidence is honestly bimodal, not smoothly calibrated** (clean docs ≈1.0, weak-but-clear
   ≈0.3). Is a learned calibration (Platt/isotonic on a labeled set) or per-class temperature
   worth it — or is bimodal fine because the inputs genuinely are? Gated on Q4.

3. **Multi-domain routing is conservative by design** (both domains must clear the floor and be
   within margin), so a genuinely dual-domain doc (a contract *with* financials) routes single
   and loses half. Is a real multi-domain *extraction* mode worth it, or is the corpus glossary
   the right home for cross-domain vocab — making the classifier's job purely single-label?

4. **The A3 labeled set is tiny (36, hand-authored, all single-domain).** Any calibration or
   threshold tuning is only as trustworthy as this set. Grow it from a real corpus (the
   `my-projects-meta-analysis` bunny?), and add genuinely-mixed gold to exercise the multi/tie
   branches that synthetic content barely reaches.

5. **Strategic: is the classifier earning its keep at all?** It's opt-in and secondary to the
   corpus glossary. When *should* a user enable `cascade`? If the answer is "rarely," maybe the
   investment belongs in the glossary path and the classifier stays a thin domain-router.

## Not touched (deliberately)

`doc-classifier/` (Python, 66-label BERT sketch) left as-is per Sabaka. The `bert` enum value +
a couple of leaky `CONTENT_CLASSES` regexes are slated as local cleanups (no brainstorm needed).
The `CLASS_TO_PARTIAL` two-place pin is a deliberate tripwire — keep or de-dupe is a minor call.

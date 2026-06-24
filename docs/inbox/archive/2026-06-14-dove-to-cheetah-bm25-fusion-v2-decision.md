# Brief v2 — lexical signal in the *decision* path: gated escalation for low-cosine high-overlap aliases

**From:** Dove 🕊️ · **To:** Cheetah 🐆 · **Date:** 2026-06-14
**Type:** experiment spike (calibration + LLM-in-the-loop). **Supersedes the placement** of
`2026-06-14-dove-to-cheetah-bm25-fusion-spike.md` (v1).
**Justified by:** the v1 NO-GO (`...-bm25-fusion-spike-results.md`). v1 proved (a) aliases are **not**
lost at candidate generation — top-N cosine blocking already captures them, and at `blockTopN=0` every
pair is a candidate; (b) they die one stage later at `decide`'s `cosine < 0.72 → reject`, which never
reaches the adjudicator; and (c) the lexical channel **is real** — char-trigram-overlap / token-Jaccard
separate aliases from siblings far better than cosine, **0.80 vs 0.53 on code identifiers** where
embeddings are near-chance. v1's guard-rail ("never the merge path") is exactly what made it inert.
**So v2 deliberately re-opens that fence** — and re-argues the precision guard inside the decision.

## Thesis v2 (one sentence)
A **gated escalation rule** — *if `cosine ∈ [floor, 0.72)` AND `lexical_overlap ≥ τ`, route the pair to
the adjudicator instead of auto-rejecting* — recovers low-cosine/high-overlap aliases (`Epicure-Cooc ≡ Cooc`,
and the code-identifier regime) **without** auto-merging anything, because the LLM adjudicator + digit veto
still make every merge call. It is **additive**: the `cosine ≥ 0.72` path is untouched.

## The trap, relocated (read before designing)
v1's swiss-cheese trap doesn't disappear — it **moves into the decision**. Auto-merge is still impossible
(adjudicator gates it), so the risk is no longer over-merge. It is two new things:
1. **Adjudicator precision on the newly-escalated band.** High-overlap non-aliases (`swiss cheese | cheese`,
   `Apple Silicon | Apple`, `generative AI | AI`) now reach the LLM. The gate **fails** if the adjudicator
   wrongly accepts them.
2. **Adjudication cost.** Every escalation is an LLM call. The gate **fails** if the newly-escalated set
   isn't bounded (low hundreds; well under the `maxAdjudications` cap of 2000).

**The asymmetry is in our favour and is the whole reason this can work:** true aliases are *high* lexical
overlap; the sibling hard-negatives that broke v1's premise (`enoki | shiitake`, `performance | efficiency
cores`) are lexically *dissimilar* — they won't trip the gate at all. Only genuine **hypernym/substring**
overlap pairs burden the adjudicator, and that's a small, nameable set. So the experiment is really: *does
the adjudicator hold precision on the narrow hypernym-overlap band the gate newly surfaces?*

## Phase 0 — confirm the decision-path seam (light; v1 already mapped most of it)
v1 confirmed: candidate blocking `agglomerativeCluster.ts:42-60`/`:224-238`; `decide`
`Canonicalizer.ts:234-268` (escalate band `[0.72, 0.88]`, `cosine < 0.72 → reject`); adjudicator `:271-303`
(sees a *pair*, not a score); digit veto inside `decide` `:245,249,262`. Re-verify and add:
1. The **exact** branch where `cosine < 0.72` auto-rejects, and the minimal insertion point for an additive
   pre-check that can *redirect* such a pair to the adjudicator. Cite file:line.
2. Confirm the rule can be **purely additive** — it only fires for `cosine < 0.72` and never alters the
   `≥ 0.72` accept/escalate logic. If the code structure makes that hard, say so before building.
3. Confirm the digit veto applies to escalated pairs too (it's inside `decide`, so it should — verify).
4. Confirm an adjudication harness exists that can run the labeled probe pairs through the *real*
   adjudicator (local model acceptable; this is the offline path). Note its model + cost per call.

Label every claim CONFIRMED / INFERRED / UNVERIFIED.

## Phase 1 — narrow web check (optional; wall holds, but little new to find)
v1 already settled the ER-blocking literature (word-BM25 degenerate on short names; rank-fusion needs a
candidate list). Only **one** open metric question is worth a citation:
- For the **containment** alias pattern (`Cooc ⊆ Epicure-Cooc`), **token-Jaccard is the wrong metric** — it
  penalises the extra `Epicure` token (`|∩|/|∪|` is dragged down). The containment-correct choices are
  **token overlap-coefficient** (`|∩|/min(|A|,|B|)`) and **char-trigram overlap** (substring-friendly).
  Confirm this framing against ER literature if a citation changes the recommendation; otherwise proceed.

## Phase 2 — calibrate the gate (embeddings + lexical, NO LLM yet, free)
On **both** probe corpora (reuse v1's sets; **add** hypernym hard-negatives: `swiss cheese|cheese`,
`Apple Silicon|Apple`, `generative AI|AI`, plus the `interpretability|autointerpretability`-style arguables):
1. **Pick the lexical metric.** Compare **char-trigram-overlap** (v1's strongest on code, 0.802) and
   **token overlap-coefficient** (containment-correct) and token-Jaccard (v1 baseline). Prefer a
   containment-biased metric for the `X ⊇ alias` pattern; let the probe data confirm. **No word-BM25, no RRF**
   (both falsified in v1).
2. **Set `τ` (overlap floor) and `floor` (cosine floor).** `floor` bounds the escalation set so we don't
   escalate the entire sub-0.72 mass; `τ` is the overlap bar. Report, as a function of `(τ, floor)`:
   - **count of curated aliases** that currently die at `cosine < 0.72` and would now be **escalated**, and
   - **size of the total newly-escalated set** (this is the projected adjudication-call delta).
   Choose the operating point that escalates the aliases while keeping the new set in the low hundreds.
3. This phase is pure set arithmetic — no LLM. Output: chosen metric, `(τ, floor)`, escalated-alias count,
   escalated-set size, and the hypernym pairs that *also* land in the escalated set (the adjudicator's burden).

## Phase 3 — the actual gate: LLM-in-the-loop adjudication (the go/no-go)
Run **only the newly-escalated set** from Phase 2 through the **real adjudicator** (local model; record which).
This is the merge path — the headline is precision, not separation.
- **Adjudicator precision on the newly-escalated band:** of newly-escalated pairs, fraction the LLM
  correctly **accepts (true aliases)** vs **rejects (hypernyms/non-aliases)**. Break out the two classes.
- **Recovered aliases:** curated aliases that died at `cosine < 0.72` in baseline and now **merge** end-to-end.
- **Call-count delta:** actual adjudication calls added vs baseline.
- **Regression check:** every pair that merges/holds correctly in baseline still does (the rule is additive;
  prove it changed *nothing* for `cosine ≥ 0.72`).

## Verification gate (v2 passes iff)
| gate | pass condition |
|---|---|
| aliases recovered end-to-end | ≥ 1 curated alias per corpus that baseline rejected now merges (the metric v1 couldn't move) |
| adjudicator precision on escalated band | hypernym hard-negatives (`swiss cheese|cheese`, `Apple Silicon|Apple`, …) **rejected** by the LLM — **fail on any wrong accept** |
| escalation set bounded | newly-escalated set in the low hundreds, call-count delta under `maxAdjudications` |
| additive / zero regression | `cosine ≥ 0.72` behaviour byte-identical to baseline |
| digit veto holds | escalated digit-mismatch pairs still vetoed |
| offline | adjudication runs on a local model |

## Decision handed back to Sabaka / Dove
If it passes: gate behind a config axis (`pipeline.canonicalization.lexicalEscalation` with `metric`, `τ`,
`floor`) defaulting **off** until a second corpus confirms — the precision risk lives in the adjudicator now,
so it earns a flag, not an unconditional flip. If the adjudicator-precision gate fails (hypernyms wrongly
merged), that's a real NO-GO: the signal can't be trusted into the decision without a stronger guard, and we
stop here rather than ship a known over-merge path.

## Out of scope
- Candidate-generation fusion (v1 settled: inert; do not revisit).
- Continuous score blending into `decide` (re-tunes the whole band; RRF already regressed). **Gated escalation
  only** — a discrete additive redirect, not a new combined score.
- Touching the `cosine ≥ 0.72` accept/escalate logic, the threshold, or the linkage.
- Relation canon (closed vocab post-Phase 2; defer).

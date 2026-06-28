# Exploratory brief — lexical (BM25) + semantic fusion for canon candidate generation

**From:** Dove 🕊️ · **To:** Cheetah 🐆 · **Date:** 2026-06-14
**Type:** exploratory spike (web research + design fork + minimal implementation). **Not** a build order.
**Origin:** Stanford KGGen (NeurIPS '25, arXiv:2502.09956) retrieves within-cluster resolution
candidates with a *fused BM25 + semantic* score. The embedding-bench
(`2026-06-12-cheetah-embedding-model-bench.md`) proved name-only embeddings can't separate true
aliases from siblings on the live mixed corpus (embeddinggemma **AUC 0.385, negative d′**; best
model tops out **~0.75**). A lexical channel is the complementary signal the bench said was missing.
**Slots into:** Phase 4 item 3 (embedding-blocked candidate generation) — we're at Phase 10 gates,
so this is exploratory, not a re-open of Phase 4's contract.

---

## The thesis to test (one sentence)
A lexical-overlap channel, fused into **candidate generation** (not the merge decision), rescues
high-overlap alias pairs (`Epicure-Cooc ≡ Cooc`, `Epicure-Core ≡ Core`) that the anisotropic
embedding space buries in the sibling band — **without** collapsing genuine hypernym/sibling pairs,
because the existing LLM adjudicator + threshold still own the final precision call.

## The trap this brief exists to avoid
Lexical overlap is **necessary, not sufficient**. `Epicure-Cooc | Cooc` (true alias, high overlap)
and `swiss cheese | cheese`, `Apple Silicon | Apple` (hypernym/sibling, ALSO high overlap) look the
same to BM25. So BM25 **must not be allowed to merge anything directly**. Its job is recall in the
candidate set; precision stays with the adjudicator. If the spike puts the lexical score anywhere in
the *merge* path rather than the *candidate* path, it will over-merge hypernyms and the spike fails.
Mirror Stanford here: their BM25+semantic feeds the LLM dedup step, it doesn't decide.

---

## Phase 0 — independent code recon (NO WEB, wall is hard)
Do this before opening a browser. Web research that precedes understanding the actual code path
produces recommendations that don't fit our seams.

1. Map the current canon candidate/blocking path end to end. Where do pairs become "candidates"?
   Where does `blockTopN` apply? Where does the embedding similarity get computed, and where does
   the digit-mismatch veto sit relative to candidate generation vs the merge decision? **Cite
   file:line for each.**
2. Identify the exact insertion seam for a lexical channel that is *candidate-only*. State whether
   the adjudicator currently sees a score or just a pair; the fusion output feeds candidate ranking,
   not the accept/reject.
3. Confirm the digit veto fires **after** any fusion (a fused lexical score must never override it —
   `128-bit … | 256-bit …` share most tokens).
4. Locate the reusable probe sets from the embedding-bench (telegram-sink +16/−13, kg-gen self
   +9/−14) and confirm they're loadable by a new sandbox script without re-curation.

**Output of Phase 0:** a seam map with file:line, every claim labeled **CONFIRMED** (read it) /
**INFERRED** (deduced, not seen) / **UNVERIFIED** (couldn't open). No design opinions yet.

## Phase 1 — web research (unlocks only after Phase 0 is written)
Forcing function: **a citation earns its place only if it changes a recommendation.** Decoration
citations get cut. Resolve these specific forks, nothing broader:

1. **BM25 on short strings is degenerate.** Entity names are 1–4 tokens; BM25's IDF over a
   ~700-"document" corpus of names is not what BM25 was built for. Find what the ER literature
   actually uses for short-name blocking: token-Jaccard / overlap coefficient, **character n-gram**
   BM25/TF-IDF, or trigram similarity. Bring back which separates *containment* aliases
   (`Epicure-Cooc ⊃ Cooc`) best. (Overlap coefficient is containment-biased by definition — check it.)
2. **Fusion method under anisotropy.** Our own Phase-4 note says cosine thresholds have no
   consistent cross-model meaning (anisotropic pile-up). A naive weighted-sum of an uncalibrated
   cosine + a lexical score inherits that miscalibration. Compare **Reciprocal Rank Fusion (RRF)**
   (rank-based, scale-invariant — matches the bench's reason for using AUC) against equal-weight
   normalized sum (what Stanford used) and a simple OR-gate (lexical-OR-semantic candidate union).
   Recommend one, with the anisotropy argument as the tiebreaker.
3. **Read Stanford's actual resolution code**, not just the paper: `src/` in `stair-lab/kg-gen`.
   Confirm how they fuse (equal weight? rank? what tokenizer?) and whether they hit the
   short-name problem. Label CONFIRMED only if you read the source.
4. **ER blocking recall vs candidate-set blow-up.** Confirm the standard framing (cheap lexical/LSH
   blocking → expensive adjudication) and any guidance on keeping the candidate set bounded.

## Phase 2 — design decision (resolve the forks)
State, with the Phase-1 evidence: (a) tokenization (BM25 vs char-ngram vs overlap-coeff),
(b) fusion (RRF vs weighted-sum vs OR-gate), (c) placement (candidate-only, confirmed against the
Phase-0 seam). One paragraph, decision + the single fact that drove it.

## Phase 3 — minimal spike (embeddings-only, local, reproducible)
New sandbox script in the existing pattern (`examples/sandbox/canon-fusion-spike.ts`), no production
default touched. Free/local: reuse the cached embeddings + BM25/lexical computed in-process.

- Run the chosen lexical channel + the chosen fusion over the **existing probe sets**.
- Report, against name-only embeddings as baseline: **AUC, d′**, and the two diagnostic counts that
  actually matter — *alias pairs rescued* (Epicure-X≡X ranked into candidates) and *sibling/hypernym
  pairs NOT promoted* (enoki|shiitake, swiss cheese|cheese, Apple Silicon|Apple stay out).
- **Adjudication-budget forcing function:** report the candidate-count and projected adjudication-call
  delta vs the current path. The whole point of Phase 4 was bounding adjudication to the low hundreds;
  a fusion that rescues aliases but triples the candidate set fails this gate.

---

## Verification gate (spike passes iff)
- Fusion lifts the alias pairs into the candidate set on **both** probe corpora, measured as a
  rescued-alias count, not just a 2nd-decimal AUC bump (the bench warned AUC noise ≈ ±0.05–0.08).
- **Zero** new hypernym/sibling promotions vs baseline (the swiss-cheese trap). **Fail if** any
  sibling pair the bench used as a hard negative gets promoted to a merge candidate.
- Projected adjudication calls stay in the low hundreds / under the `maxAdjudications` cap. **Fail
  if** the candidate set blows the budget.
- Digit veto still fires post-fusion. **Fail if** a digit-mismatched pair survives fusion.
- Lexical channel is local/free (no network, no LLM) — consistent with offline-first.

## Decision point handed back to Dove/Sabaka
If the spike passes: is the lexical channel worth a config axis
(`pipeline.canonicalization.lexicalFusion`), or is it unconditionally on? Lean: unconditionally on
if it's free and strictly improves candidate recall without precision cost; a flag only if Phase 3
shows a corpus where it hurts.

## Out of scope
- Changing the merge/accept decision, the threshold, or the linkage. Candidate-generation only.
- Relation-phrase fusion (relation vocab is closed post-Phase 2 — defer, as in Phase 4).
- Any production default flip. This is a sandbox spike with a go/no-go.

# Embedding-model separation benchmark (for canonicalization)

**From:** Cheetah · **To:** Dove · **Date:** 2026-06-12
**Why:** Phase 4 / 4b showed embeddinggemma separates poorly (anisotropic, 0.92 knife-edge).
Before committing canon to an embedding model, benchmark Sabaka's 5 local Ollama models for
*latent separation* — and cheaply test the domain→model-mapper premise on two domains.

## Method

Reproducible: `examples/sandbox/embedding-bench.ts` (embeddings-only, local, free). For each
model × corpus: embed every entity name, then over a **curated probe set** measure how well the
model ranks **true co-referents** above **near-miss homonyms/siblings**:

- **AUC** = P(sim(synonym) > sim(hard-negative)) — rank-based, scale-invariant (the ranking key,
  since anisotropy makes raw cosine thresholds incomparable across models).
- **d′** = standardized gap between the two groups.
- **thr\*** = Youden-J threshold on the probe set; **collapse@thr\*** = names merged under
  complete-linkage at that threshold.

Probe sets hand-curated from the existing canon merge logs (positives = real aliases; hard
negatives = the over-merges a good model must keep apart). Telegram-sink: +16/−13. kg-gen self
(code): +9/−14. **Caveat:** small probe sets → AUC noise ≈ ±0.05–0.08; read the *pattern*, not
2nd-decimal gaps.

## Results

**telegram-sink (mixed: ML + Apple hardware + cuisine), 738 entities**

| model | AUC | d′ | pos̄ | neḡ | thr\* | med/p99 |
|---|---|---|---|---|---|---|
| mxbai-large | **0.692** | 0.54 | 0.904 | 0.883 | 0.923 | 0.45/0.66 |
| nomic (raw) | **0.692** | 0.36 | 0.855 | 0.828 | 0.878 | 0.37/0.57 |
| nomic (search_document:) | 0.688 | 0.49 | 0.895 | 0.869 | 0.913 | 0.55/0.72 |
| snowflake-arctic | 0.673 | **0.66** | 0.935 | 0.914 | 0.916 | 0.69/0.83 |
| granite | 0.615 | 0.47 | 0.905 | 0.888 | 0.873 | 0.55/0.73 |
| **embeddinggemma** | **0.385** | **−0.49** | 0.897 | 0.916 | 0.927 | 0.65/0.80 |

**kg-gen self (code/technical), 685 entities**

| model | AUC | d′ | pos̄ | neḡ | thr\* | med/p99 |
|---|---|---|---|---|---|---|
| nomic (raw) | **0.754** | 0.91 | 0.809 | 0.713 | 0.809 | 0.40/0.57 |
| snowflake-arctic | 0.714 | **0.93** | 0.915 | 0.889 | 0.914 | 0.74/0.85 |
| granite | 0.683 | 0.66 | 0.868 | 0.834 | 0.888 | 0.57/0.71 |
| embeddinggemma | 0.667 | 0.63 | 0.908 | 0.883 | 0.913 | 0.68/0.80 |
| nomic (search_document:) | 0.611 | 0.61 | 0.848 | 0.808 | 0.824 | 0.57/0.71 |
| **mxbai-large** | **0.532** | 0.23 | 0.843 | 0.833 | 0.857 | 0.48/0.64 |

## Reading

1. **embeddinggemma is the wrong canon model.** On the *live* mixed corpus it scores **AUC 0.385
   with negative d′** — it rates sibling/homonym pairs *more* similar than true synonyms
   (neḡ 0.916 > pos̄ 0.897). This is the Phase-4 over-merge pain, quantified. It's only mediocre
   (0.667) on code. The 0.92 knife-edge wasn't a tuning miss — the geometry conflates near-misses.
2. **nomic-embed-text (raw) is the robust pick.** Tied-best on mixed (0.692) **and** clearly best
   on code (0.754); the most consistent across domains, and the smallest model (274 MB). It is the
   one model that never lands in a domain's failure zone.
3. **snowflake-arctic owns d′** on both (0.66 / 0.93) — the cleanest standardized margins — but
   trails nomic on AUC. Strong alternative; worth a head-to-head if we want the tightest band.
4. **The extremes flip by domain:** embeddinggemma (bad-mixed / ok-code) and mxbai
   (ok-mixed / near-random-code, 0.532) are mirror images. So the **mapper premise has a real
   basis** — domains genuinely favor different models *at the extremes*. **But it isn't needed
   yet:** a robust generalist (nomic-raw) wins/ties both, avoiding both failure zones. Keep the
   domain→model mapper in backlog (with WI4 dual-model override); revisit only if a single model
   can't cover the domains a real deployment spans.
5. **The nomic document prefix HURTS** for this symmetric name↔name task (code 0.611 vs 0.754
   raw). So we do **not** need to add prefix support to `EmbeddingService` — raw is correct here.
6. **Honest ceiling:** even the best model tops out at **AUC ~0.75**. The brutal hard negatives
   (`enoki|shiitake`, `performance|efficiency cores`, `TextReader|PdfReader`) are likely
   unresolvable from *names alone* — they need observation/context signal. So canon-by-name has an
   intrinsic ceiling; complete-linkage + threshold tuning (Phase 4) stay necessary under any model.

## Recommendation

- **Switch canon's embedding model from embeddinggemma to `nomic-embed-text` (raw, no prefix)**,
  and **recalibrate its threshold** (a 4b-style histogram/probe pass — its distribution differs;
  the 0.92 embeddinggemma number does NOT transfer; Youden here suggested ~0.88 mixed / ~0.81 code
  but the probe set is small). Consider a `snowflake-arctic` head-to-head before locking in.
- **Do not use embeddinggemma for canon** (below-random on the live corpus). It may still be fine
  for *generation-side* retrieval seeding, which is a different task — not tested here.
- **Investigation only** — no production default changed in this pass. The follow-up (point
  `embeddings.model` at nomic + recalibrate) is small and awaits Sabaka's go.
- **Mapper / domain-specific models (FinBERT, medicalgemma): stays backlog.** This run shows a
  generalist suffices for the domains on hand; the mapper earns its complexity only if a future
  deployment spans domains no single local model covers.

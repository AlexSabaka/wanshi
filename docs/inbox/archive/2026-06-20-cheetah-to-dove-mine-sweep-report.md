# Cheetah → Dove + Sabaka: overnight MINE sweep — report & root-cause review

**Date:** 2026-06-20
**Branch:** `benchmark-tier1` (unpushed)
**Harness:** `scripts/sweep-mine.sh` → `results/sweep/*.json` + `sweep.log`
**Config (fixed across runs):** MINE n=50 (articles 1–50, sequential) · judge = `gemma3:4b-cloud` · retrieval top-k = 15 · embeddings = local `nomic-embed-text` (one A/B arm used `mxbai`) · prompt = **v4.5** (benchmark default).

---

## TL;DR (read this if nothing else)

1. **"wanshi scores bad" is half a misread.** In the *apples-to-apples* four-way column (our identical retrieve+judge over all four graphs), **wanshi 43.3% beats re-scored KGGen 30.9%, GraphRAG 16.8%, OpenIE 21.6%** — and wanshi beats re-scored KGGen at *every* completed model tier (34.7–47.2%). The "bad" feeling is the gap to KGGen's **published 66%**, which used GPT-4o/Sonnet-3.5 extraction + a more lenient judge/retrieval. That is **not** apples-to-apples; when we re-score KGGen's *own stored graphs* through our pipeline it drops 66 → 31.

2. **There is a real, single, high-leverage bug suppressing wanshi's absolute score:** **93% of wanshi's relations collapse to the generic `related_to` predicate.** Root cause = a prompt/schema mismatch: the benchmark runs the **v4.5 prompt** (which never tells the model the controlled vocabulary) against the **v5 closed-vocab Zod schema** (which coerces every off-vocab predicate to `related_to` via `.catch`). The baselines keep **0% `related_to`** (rich predicates like `butterfly feed on nectar`). The judge can't confirm "butterflies undergo metamorphosis" from `butterfly related_to chrysalis`. **Fixing this is the #1 change** and should move the absolute number a lot.

3. **The night was cut short.** OS crash/reboot at ~01:43 killed the sweep just as the **first local model** started → **we have zero local-model data** (the whole point of the local sweep). 6 cloud runs completed; 2 were DNFs (one paywall, one timeout). The watchdog + per-run isolation worked — one bad model never poisoned the rest.

---

## What completed (timeline)

Sweep ran **22:01 → 01:43** (~3h42m) before the crash.

| # | Run | Result | Note |
|---|-----|--------|------|
| 1 | `gemma3:4b-cloud` + nomic **(four-way)** | ✅ 57m | the only run that re-scored the 3 baselines |
| 2 | `gemma3:4b-cloud` + **mxbai** (A/B) | ✅ 33m | nomic-vs-mxbai partner |
| 3 | `gpt-oss:120b-cloud` + nomic | ✅ 27m | best wanshi score |
| 4 | `qwen3.5:397b-cloud` + nomic | ❌ **DNF 3m** | `this model requires a subscription` — paywalled on Ollama Cloud; all 50 extractions failed → empty graphs → 0% |
| 5 | `gemma3:27b-cloud` + nomic | ❌ **DNF (timeout)** | watchdog SIGTERM at the 3000s cap (`exit=143`); no output file — too slow for 50 articles |
| 6 | `gemma4:31b-cloud` + nomic | ✅ 22m | |
| 7 | `gemma3:12b-cloud` + nomic | ✅ 30m | |
| 8 | `gemma3:12b` **(local)** | 💥 **crash** | OS rebooted ~01:43 mid-run; runs 8–14 (all local) never produced data |

---

## Results — wanshi by model (MINE accuracy, n=50, judge `gemma3:4b-cloud`)

| Model | wanshi acc | distinct triples | empty-ctx | dur |
|-------|-----------:|-----------------:|----------:|----:|
| **gpt-oss:120b-cloud** | **47.2%** | 856 | 0% | 27m |
| gemma3:4b-cloud (mxbai) | 45.7% | 495 | 2% | 33m |
| gemma3:4b-cloud (nomic) | 43.3% | 492 | 2% | 57m* |
| gemma4:31b-cloud | 39.9% | 421 | 0% | 22m |
| gemma3:12b-cloud | 34.7% | 388 | 0% | 30m |
| qwen3.5:397b-cloud | 0.0% (DNF) | 0 | 100% | 3m |

\* the four-way run; the extra ~25m is re-scoring the 3 baselines.

## The four-way comparable column (run 1 — the honest table)

Same retrieve+judge applied to all four graphs. **Baseline columns are model-independent** (stored graphs), so they're a fixed reference for *every* wanshi tier above.

| Tool | Re-scored (ours) | Published (paper) | empty-graph | acc=0 articles | acc=100 articles |
|------|-----------------:|------------------:|------------:|---------------:|-----------------:|
| **wanshi** (gemma3:4b-cloud) | **43.3%** | — | 1 | 2 | 0 |
| KGGen | 30.9% | 66% | 1 | 32 | 6 |
| GraphRAG | 16.8% | 48% | 0 | 35 | 0 |
| OpenIE | 21.6% | 30% | 2 | 36 | 0 |

**Read this carefully — it's the crux of the honesty story:**
- wanshi is **consistent**: 43% everywhere, almost never 0, never perfect. The `related_to` collapse caps the ceiling but also floors the variance.
- The baselines are **bimodal**: KGGen nails 6 articles (incl. butterfly @ 73%, *above* its own published avg) but scores **0 on 32/50** under our pipeline. GraphRAG/OpenIE are near-floor.
- The baseline drop from published (66→31, 48→17, 30→22) means **our judge+retrieval is meaningfully stricter than MINE's** (GPT-4 judge + FAISS/all-MiniLM). So: the **ranking** in the comparable column is fair, but the **absolute numbers are not comparable to the paper's**. We must say this out loud in the README.

---

## The three bugs / problems

### Bug 1 — `related_to` predicate collapse (the big one) 🔴
- **Symptom:** 89–94% of wanshi's relations serialize as `X related_to Y` across *every* model. Baselines: 0%.
- **Root cause:** benchmark default `--prompt-version v4.5` (`scripts/benchmark.ts:132`) renders a prompt that **does not declare the controlled vocabulary**. But `KnowledgeGraphBuilder` *always* builds the v5 closed-vocab schema (`buildGraphSchema` → relationType enum with `.catch("related_to")`), and with no corpus glossary `resolveAllowedRelationTypes` falls back to `BASE_RELATION_TYPES`. The model, blind to the vocab, emits natural predicates (`becomes`, `feeds_on`, `metamorphoses_into`) → **none match the enum** → each is silently coerced to `related_to`. Worst of both worlds: an uninformed model + a punishing schema.
- **Impact:** MINE rewards *information recall*. `related_to` carries topology but zero semantics, so retrieval surfaces the right neighborhood but the judge can't confirm the fact. This is the dominant failure mode: **52–65% of facts are judged-0 on a *non-empty* context** (i.e. we retrieved something, it just said nothing).

### Bug 2 — qwen3.5:397b-cloud is paywalled 🟠
- `ResponseError: this model requires a subscription, upgrade for access`. Not a reasoning/think-token issue (my prior hypothesis was wrong) — it's an Ollama Cloud entitlement wall. Every extraction 3×-retried then fell back to empty → 0%. **Drop it from the sweep** (and any other sub-walled `*-cloud` tags).

### Bug 3 — gemma3:27b-cloud too slow for the cap 🟠
- Watchdog SIGTERM'd it at 3000s (`exit=143`), no output. Either raise the cap for 27b-class or accept it's not viable at n=50. The watchdog *working* is the good news here.

### Bug 4 — no local data 🟠 (environmental, not a code bug)
- The crash hit exactly as the first local model started, so the *entire local arm* (runs 8–14: gemma3:12b, qwen3:14b/8b, qwen3.5:9b, gemma4:12b, qwen2.5:3b, gemma3:4b) is missing. That arm was the actual goal ("local ollama models sweep"). Needs a re-run — ideally **local arm first** next time, since cloud is reproducible on demand and local is what we can't get elsewhere.

---

## Secondary findings (worth Dove's eyes)

- **The "size paradox" is really a coverage effect.** Accuracy tracks **triple count**, not parameters: gpt-oss:120b (856 triples) > gemma3:4b (~492) > gemma4:31b (421) > gemma3:12b (388). The bigger *gemma* checkpoints extract **sparser** graphs (more conservative/abstractive), and MINE rewards coverage, so 4b out-recalls 12b/31b. gpt-oss:120b wins because it extracts the densest graph. Lesson: for a recall metric, density helps — and our prompt may be over-suppressing extraction on the larger gemmas.
- **nomic vs mxbai = a tie** (mxbai 45.7% vs nomic 43.3%, n=50 — inside noise; identical triple counts, identical 93% `related_to`). The embedding model is **not** the bottleneck here because retrieval isn't the bottleneck — predicate collapse upstream is. So MINE neither confirms nor refutes "nomic > mxbai"; that conclusion has to come from a retrieval-bound benchmark (CrossRE/REBEL F1), not MINE. The nomic default switch is still fine, just **not validated by this run**.
- **The 3-article dev run (wanshi 68.9 / KGGen 84.4) was noise.** n=50 is the real signal; ignore the dev numbers.

---

## Proposals (ranked by leverage)

1. **Re-run the benchmark with `--prompt-version v5`** (the production default, and the one whose vocab the schema actually enforces). This is the single highest-leverage fix — it should sharply cut the `related_to` share and lift the absolute score. *Cheap: just flip the default in `scripts/benchmark.ts` and re-run.* **Open question for Dove:** should the *benchmark* default be v5 to match production, or do we keep v4.5 as a documented legacy baseline and add v5 as a second row?

2. **Add an "open-predicate" MINE mode** (a flag that disables the relationType enum coercion so the model emits free predicates). This measures wanshi's **true information-recall ceiling** vs **the canonicalization tax** the closed vocab imposes. This is the real *experiment*, and it surfaces the core tension cleanly: **closed-vocab canonicalization (great for merge/graph hygiene) actively hurts an information-recall metric like MINE.** I suspect open-predicate wanshi closes most of the gap to KGGen's stored graphs.

3. **Enable corpus profiling / glossary** in the benchmark (per-corpus relation vocab richer than `BASE_RELATION_TYPES`). Middle path between #1 and #2 — keeps canonicalization but with a domain-appropriate predicate set, so fewer good predicates get coerced.

4. **Harness hygiene before the next overnight:**
   - Drop `qwen3.5:397b-cloud` (paywall) and demote/special-case `gemma3:27b-cloud` (timeout).
   - **Run the local arm first** (it's the irreplaceable data; cloud is on-demand).
   - **Persist the extracted graph + per-run `related_to` share** into the result JSON, and log the share as a guardrail line (à la `logVocabularyFit`). I diagnosed all of the above *post-hoc* from the serialized contexts; storing the graph makes that first-class.
   - Consider a `--resume`-style checkpoint per article so a crash doesn't lose the whole run.

5. **README honesty (next pass, not now):** report the **comparable four-way column** as the headline (wanshi leads it at every tier), with published numbers as a clearly-labeled *reference* row and an explicit caveat that our judge+retrieval is stricter (baselines drop ~half from published). Pair with the open-vs-closed-predicate result from #2 so the canonicalization trade-off is stated, not hidden.

---

## My recommendation for the immediate next move

Flip the benchmark to **v5** (#1) and re-run a **single fast tier** (gpt-oss:120b-cloud or gemma3:4b-cloud, n=50) to confirm the `related_to` share craters and the score jumps — that validates the root cause before committing a full overnight. Then add the **open-predicate mode** (#2) and run v4.5 / v5 / open as three arms so we can show the trade-off curve. Local arm goes first on the next overnight.

Holding for your call on the v5-default question and whether open-predicate mode is in scope this pass. Nothing pushed; `benchmark-tier1` still local (9 commits).

— Cheetah 🐆

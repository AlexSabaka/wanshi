---
id: results
title: Benchmark results
description: Measured CrossRE entity extraction and the in-progress MINE fact-retention comparison.
---

# Benchmark results

The scoring methodology (pre-registered, applied identically to wanshi and every baseline) is on the **[methodology](./methodology.md)** page.

## Measured benchmark (CrossRE)

Dataset **CrossRE `ai-test`**, n = 17–20 (failed extractions excluded, not zeroed); prompt **v5**; generation via **OpenRouter**; matching via local `mxbai-embed-large:335m` at semantic threshold 0.80. *Indicative, not definitive — small n, single domain, cloud inference.* Reproduce with `npm run benchmark -- --provider openai --host https://openrouter.ai/api/v1 --model <id> --dataset crossre --limit 20 --prompt-version v5`.

| Model | n | Entity F1 (sem) | Relation F1 | Triple F1 | Intrinsic |
| ----- | - | --------------- | ----------- | --------- | --------- |
| `qwen3-14b` | 17 | **0.851** | 0.130 | 0.037 | 83.9 |
| `qwen3-8b` | 19 | 0.808 | 0.187 | 0.019 | 82.0 |
| `gemma-3-4b-it` | 20 | 0.807 | 0.198 | 0.036 | 83.4 |
| `gemma-3-27b-it` | 20 | 0.767 | **0.211** | **0.070** | 82.8 |
| `gemma-3-12b-it` | 20 | 0.716 | 0.093 | 0.019 | 74.7 |

The **"small Gemma beats larger Gemmas"** result holds under corrected sampling: `gemma-3-4b-it` outperforms both `gemma-3-12b-it` and `-27b-it` on entity extraction and lands ~2nd of 5 overall. Relation/triple F1 are uniformly low — CrossRE relation extraction is hard under strict matching. *(This is an entity-extraction signal on one constrained domain; it does not generalize to the fact-retention picture below.)*

## Measured benchmark (MINE — fact retention) · *in progress, and not flattering*

A second, harder benchmark measures **fact retention**, not triple matching: extract atomic facts from an essay, semantically retrieve graph nodes + their 2-hop neighbourhood, and let an LLM judge whether each fact was recovered (the pre-registered MINE metric — see the **[methodology](./methodology.md)**). It runs **identically** against wanshi and three open-source baselines.

The honest read so far: **wanshi trails the field.** All four tools re-scored under one fixed local judge (`deepseek-v4-flash`, n = 70):

| Tool | MINE recall (same local judge) | Paper (GPT-4o judge) |
| ---- | ------------------------------ | -------------------- |
| KGGen | **63.9%** | 66% |
| OpenIE | 40.5% | 30% |
| GraphRAG | 35.4% | 48% |
| **wanshi** (v5) | **17.5%** | — |

Read it with the caveats, not as a headline:

- **In progress.** The qwen and frontier-model cells aren't finished — every number here is intermediate.
- **The judge is stricter than MINE's paper.** Under our local `deepseek-v4-flash` judge the published baselines shift (KGGen 66→64, GraphRAG 48→35, OpenIE 30→41), so absolute numbers aren't paper-comparable — the *ranking* is the signal.
- **The gap is coverage, not canonicalization.** wanshi's closed-vocabulary "canonicalization tax" is real but small — open-predicate extraction scores **22.4%** vs v5's **17.5%** (~5 pt, with the `related_to` share dropping from 0% open to ~12% under v5). The remaining ~40 pt gap to KGGen is lower extraction *density/coverage*; the open-predicate direction is where the recall lives, and it's the active work.
- n = 70, single corpus. Reproduce via `scripts/sweep-mine.sh` (or `npm run benchmark`); the scoring is fixed on the **[methodology](./methodology.md)** page.

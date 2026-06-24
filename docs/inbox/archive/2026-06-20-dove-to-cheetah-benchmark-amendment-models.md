# Brief amendment — benchmark decisions + OpenRouter model lineup

**From:** Dove 🕊️ · **To:** Cheetah 🐆 · **Date:** 2026-06-20
**Amends:** `2026-06-17-dove-to-cheetah-benchmark-corpus-plan.md`, post overnight-sweep
(`2026-06-20-cheetah-to-dove-mine-sweep-report.md`). Locks the three held decisions + the model
lineup to replace the flaky ollama `-cloud` tier. Prices below are from the OpenRouter table
(crashthatch), 2026-06-20, per 1M tokens (prompt / completion).

## Decisions (your three open questions)
1. **Benchmark default → v5**, the production prompt whose vocabulary the schema actually enforces.
   v4.5 stays only as a *labeled legacy baseline row*, not the default. **But add a third row:** the
   **glossary-enabled** run — because a real user with a domain corpus gets the glossary populated, so
   v5-with-no-glossary (coercing against `BASE_RELATION_TYPES`) still isn't what production *does*. The
   glossary arm is the real product; report it.
2. **Open-predicate mode → YES, in scope.** It's not a benchmark tweak, it's the measurement of **the
   canonicalization tax** (closed-vocab helps merge/graph-hygiene, actively hurts a recall metric like
   MINE). Run **three arms: v4.5 / v5 / open** for the trade-off curve, and that number feeds the
   schema-first-vs-typeless Experiment-2 decision directly. **Caveat to bank:** if open-predicate closes
   the gap to KGGen, the honest reading is *"MINE rewards predicate richness and punishes
   canonicalization, and we made a deliberate trade,"* **not** "wanshi is better." State the trade.
3. *(Glossary arm folded into #1.)*

## The structured_output filter (non-negotiable, and itself a test)
Bug 1 (93% `related_to`) and the gemma3:4b adjudicator failure are **both schema-emission problems.**
Every extraction model in the sweep **must have OpenRouter `structured_output: ✓`** — no exceptions.
And exploit it: **gemma-4-31b (structured_output ✓) vs your local gemma3:4b experience isolates whether
the bug was the model or ollama's local structured-output handling.** That's a free diagnostic.

## OpenRouter ≠ the local sweep — they answer different questions
- **OpenRouter sweep** = the **comparative/credibility table** (wanshi vs KGGen at comparable tiers;
  reproducible, **no entitlement walls**). This is what you run *now*.
- **Local ollama sweep** = **deployment reality** (how wanshi performs on the models users *actually run*).
  Irreplaceable; still owed on the rebooted machine. Don't let OpenRouter convince you the local arm is done.
- Note: **qwen3.5-397b is NOT paywalled on OpenRouter** ($0.385/$2.45, structured_output ✓) — the wall
  was Ollama-Cloud-specific. The big-qwen point is available here if you want it.

## Why $15 is plenty (the cost shape)
- **Baselines are STORED** → zero re-extraction cost; scored once, reused across every wanshi tier.
- **The judge is the call-volume hog** (~750 calls/run: 50 articles × ~15 MINE facts). **Fix it and keep
  it cheap/local** so it isn't the cost driver.
- Then OpenRouter spend ≈ **extraction only** (~75 calls/run, ~300k in + 100k out): **cents** on cheap
  models, **~$2.25/run** on SOTA. The trade-off curve on cheap models is nearly free; only the SOTA
  headline runs cost real money.

## The judge (FIXED across every run — fairness depends on it)
- **Recommended: `deepseek/deepseek-v4-flash`** ($0.09/$0.18, structured_output ✓), fixed, cloud →
  reproducible, no hardware dependency (your machine just crashed mid-sweep), ~**$0.18/run** for judging.
- **Budget alt:** judge **local** on a fixed model — free, conserves all $15 for extraction, but ties
  results to your hardware. Fine if documented + held constant.
- **Paper-comparability:** a GPT-4-class judge (gpt-5.4 / sonnet-4.6) matches MINE's GPT-4 judge better,
  but is ~$2/run for judging *alone* — **reserve for the single final headline run**, not the sweep.

## Extraction model lineup (all `structured_output: ✓`), by tier
~$/run = extraction only, ~300k in + 100k out (judge billed separately, above).

| tier | model | $/1M (in/out) | ~$/run | role |
|---|---|---|---|---|
| cheap | `qwen/qwen3.5-9b` | 0.10 / 0.15 | ~$0.05 | proxies your local qwen3.5:9b |
| cheap | `google/gemma-4-31b-it` | 0.12 / 0.35 | ~$0.07 | gemma **with** structured_output — isolates the local bug |
| cheap | `deepseek/deepseek-v4-flash` | 0.09 / 0.18 | ~$0.045 | cheap strong baseline |
| mid | `deepseek/deepseek-v4-pro` | 0.435 / 0.87 | ~$0.22 | best value strong model — likely the sweet spot |
| mid | `minimax/minimax-m3` | 0.30 / 1.20 | ~$0.21 | strong + **video-capable** (relevant to the video pipeline later) |
| SOTA | `anthropic/claude-sonnet-4.6` | 3.00 / 15.00 | ~$2.40 | **direct lineage to KGGen's Sonnet-3.5 — the fairest same-tier cell** |
| SOTA | `openai/gpt-5.4` | 2.50 / 15.00 | ~$2.25 | the GPT-4o lineage |
| (opt) big-MoE | `qwen/qwen3.5-397b-a17b` | 0.385 / 2.45 | ~$0.36 | the un-paywalled big-qwen point |

## Budget allocation (the smart spend)
- **3-arm trade-off curve (v4.5 / v5 / open)** on the **cheap + mid** models — nearly free
  (~$0.05–0.22 × 3 each).
- **One arm (v5 + glossary, the real product)** on the **SOTA tier** (sonnet-4.6 + gpt-5.4) — the headline
  cells, ~$5 total.
- Total ≈ **$5–8** with a cheap/local judge → well under $15, with buffer for re-runs.

## The premium cell (the single most defensible comparison)
The report's table is *same scoring over stored graphs* → wanshi-on-model-X vs **KGGen-as-shipped**
(GPT-4o/Sonnet-3.5). The *true* controlled comparison is **the same extraction model for all tools.**
KGGen is LiteLLM-routed (OpenRouter-compatible) → **re-run KGGen extraction with the same OpenRouter model
as wanshi** (e.g. `deepseek-v4-pro`) for a genuine same-model head-to-head. It doubles extraction cost for
that cell (cheap models make it affordable) and **removes the "but KGGen used a SOTA model" confound
entirely.** Worth one such cell at a mid tier — it's the cleanest claim you can make.

## Harness hygiene (preconditions, from the crash)
- Drop ollama paywalled tags (OpenRouter has no per-model entitlement wall).
- **Persist the extracted graph + per-run `related_to` share into the result JSON; log the share as a
  guardrail line.** You diagnosed Bug 1 *post-hoc* from serialized contexts — make it first-class.
- **Checkpoint per article** so a crash doesn't lose the whole run.
- **Local arm first** on the next overnight (irreplaceable); the OpenRouter comparative sweep runs now,
  interleaved with your chores.

## Hand-back
Decisions locked (v5 default + glossary arm + open-predicate three-arm). Pick the judge (cheap-cloud or
local), run the trade-off curve on cheap/mid + the headline arm on SOTA, add one same-model KGGen cell.
README honesty pass (comparable column as headline, published as labeled stricter-judge reference, the
open-vs-closed trade stated) comes after the numbers land.

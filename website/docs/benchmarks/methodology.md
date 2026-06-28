---
id: methodology
title: Scoring methodology
description: The pre-registered, anti-gaming benchmark scoring applied identically to wanshi and every baseline.
---

# Benchmark scoring — pre-registered methodology

This is the **pre-registered** scoring for the wanshi extraction benchmark — fixed *before* running, and applied **identically to wanshi and every baseline**. It is the anti-gaming gate: wanshi never gets a looser rule than the tools it's compared to. The honest answer to "the F1 is low" is a *measured* number under a published rule, plus a baseline to improve against.

## Tiers (a corpus measures exactly one thing)

| Tier | Corpora (this pass) | Yields |
|---|---|---|
| **1 — gold-labeled** | CrossRE, REBEL, RedocRED, **SemEval-2010 T8**, **MINE** | comparable accuracy / F1 |
| 2 — self-labeling (later) | ICIJ via the SQLite adapter | real-corpus accuracy, no hand-annotation |
| 3 — unlabeled (later) | Enron, EDGAR, transcripts | runs-clean + intrinsic, **never an F1** |

Only Tier-1 ships this pass. Tier-2/3 are deferred; their numbers must never be reported as F1.

## Triple-F1 datasets (CrossRE · REBEL · RedocRED · SemEval-2010 T8)

The extractor's KG → triplets `(subject, predicate, object)`, scored at three levels (entity / relation / triple) with **both** matchers, reported side by side:

- **Exact** — normalized string equality (`ExactMatcher`).
- **Semantic** — embedding cosine ≥ `--match-threshold` (**default 0.80**, `SemanticMatcher`). The *same* threshold for all tools. Where exact and semantic diverge, **report both** — the gap is signal, not a number to cherry-pick.

Micro-averaged across samples (`TripleMetrics.microAverage`). Samples whose extraction *failed* (rate-limit/transient, via the builder's failed-chunk ledger) are **excluded**, not scored as 0-recall — a 429 must not masquerade as poor quality.

**SemEval-2010 T8 caveat (a labelled hole).** Each sentence has two marked nominals + one directed relation → one gold triplet. The **headline metric is entity-capture** (entity-level recall: did we surface both nominals). **Triple-F1 understates** here because open extraction won't emit SemEval's abstract relation vocabulary (`Cause-Effect`, `Component-Whole`, …); it is reported for completeness but is *not* the comparison number.

## MINE (retrieve + judge — replicates kg-gen `experiments/MINE/_1_evaluation.py`)

Not triple matching. Per article (100 articles × ~15 atomic facts), for each fact:

1. **Retrieve** — embed the graph's entity nodes; take the **top-k** (`--retrieval-top-k`, default 15) nearest to the fact; the context is their incident triples serialized `"from predicate to"`, joined by `". "`.
2. **Judge** — the **verbatim** MINE instruction:
   > Determine whether the context contains the information stated in the correct answer.
   > Respond with 1 if yes, 0 if no.

   → `evaluation ∈ {0,1}`. A judge parse-failure counts as a miss (0), never a thrown run.
3. **Score** — per-article `accuracy = correct / facts`; benchmark = mean across articles.

**Four-way, identical conditions.** The *same* retrieve+judge scores wanshi's freshly extracted graph **and** the KGGen/GraphRAG/OpenIE graphs stored in the MINE mirror (`josancamon/kg-gen-MINE-evaluation-dataset`). That re-scored column is the comparable one. The KGGen-paper headline (KGGen 66 / GraphRAG 48 / OpenIE 30) is shown as a **reference row only** — it used a different judge/retrieval (`all-MiniLM-L6-v2` + their LLM judge) and must not be conflated with the re-scored numbers. An empty graph scores 0.

> Note: our re-scored retrieval embedder is wanshi's configured embedding model, not MINE's `all-MiniLM-L6-v2`. That's fine for the *internal* four-way comparison (identical for all tools); it's why the re-scored absolute numbers may differ from the published reference.

## Forcing functions

1. **Pre-registered & identical** — this file; same matcher/threshold/judge for all tools.
2. **Both model tiers** — every headline number at **gemma3:4b** (the README default / deployment target) **and** a capable model. Report the **4b structured-output failure rate** (whether 4b degrades the extraction `json_schema` the way it failed the adjudicator schema).
3. **Real & sized** — no sub-100-sample headline metric; report variance on LLM-nondeterministic numbers (multiple runs / error bars).
4. **Standing, not one-shot** — corpora fetched by script, runnable by one command; the regression gate for "did this change improve or regress extraction quality."
5. **Honest about holes** — not every cell has a number (SemEval triple-F1, Tier-3). Label gaps; never fabricate.

## Reproduce

```bash
# Fetch corpora (network, run once → data/ is gitignored)
npx ts-node scripts/fetch-semeval.ts          # → data/semeval/{train,test}.jsonl
npx ts-node scripts/fetch-mine.ts             # → data/mine/mine.jsonl

# SemEval (entity-capture; reuses the triple-F1 harness)
npm run benchmark -- --dataset semeval --data-path data/semeval/test.jsonl --limit 100

# MINE four-way (wanshi vs re-scored KGGen/GraphRAG/OpenIE)
npm run benchmark -- --dataset mine --data-path data/mine/mine.jsonl --limit 100 \
  --provider openai --host <base-url> --model <gen-model> \
  --judge-model <cheap-or-local-judge> --output results/mine.json
```

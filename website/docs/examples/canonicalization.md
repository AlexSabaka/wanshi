---
id: canonicalization
title: Canonicalization experiment
description: A/B-test whether type sprawl comes from extraction order or a missing global merge pass.
---

# Canonicalization experiment (Experiment 1)

> Source: [`examples/canon/`](https://github.com/wanshi-kg/wanshi/tree/master/examples/canon) in the repo.

Tests whether wanshi's entity-/relation-type **sprawl** comes from *extraction order* or from the **absence of a global merge pass** — by bolting a global canonicalization stage onto the existing schema-first pipeline and measuring.

## Arms

| Arm | config | canonicalization |
| --- | --- | --- |
| `baseline` | [`baseline.yaml`](https://github.com/wanshi-kg/wanshi/blob/master/examples/canon/baseline.yaml) | disabled (current pipeline, fresh numbers) |
| `canon_embed` | [`canon_embed.yaml`](https://github.com/wanshi-kg/wanshi/blob/master/examples/canon/canon_embed.yaml) | embeddings clustering |
| `canon_hybrid` *(optional)* | [`canon_hybrid.yaml`](https://github.com/wanshi-kg/wanshi/blob/master/examples/canon/canon_hybrid.yaml) | embeddings + LLM adjudication of borderline pairs |

All three are pinned identical (corpus, seed `1337`, model, embedding model) so the A/B isolates the canonicalization variable. Only the `pipeline.canonicalization` block differs. Outputs land in `kg_tests/canon/` (gitignored).

## Run + score

```bash
# 1. Produce each arm's graph (local Ollama, or uncomment the OpenRouter llm block)
wanshi --config examples/canon/baseline.yaml
wanshi --config examples/canon/canon_embed.yaml

# 2. Score every arm with the same scorecard
wanshi metrics kg_tests/canon/baseline.json
wanshi metrics kg_tests/canon/canon_embed.json
#   add --ground-truth observations_87.jsonl for ER precision/recall + fabricated-edge rate

# 3. Audit the merge decisions — the deliverable, not the graph
wanshi inspect-merges kg_tests/canon/canon_embed.merges.jsonl
```

`wanshi metrics` reports the no-ground-truth scorecard (entity/relation-type counts, self-loops, bidirectional contradictions, referential integrity, parallel edges). `wanshi inspect-merges` lists every collapsed cluster, **suspicious over-merges first** (low intra-cluster similarity) — e.g. distinct model sizes fused, or a format collapsed with its parse functions.

## The one rule

**Do not tune `threshold` to minimize the type-count number** — that directly incentivizes over-merge, which is invisible in the aggregate counts and only visible in the merge log. Tune against `inspect-merges`.

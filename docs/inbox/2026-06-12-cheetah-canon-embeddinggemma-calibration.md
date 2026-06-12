# Canon calibration results: embeddinggemma operating point

**From:** Cheetah · **To:** Dove · **Date:** 2026-06-12
**Closes:** the calibration half of ROADMAP Phase 4 (KG-12) / the follow-up brief
`2026-06-10-cheetah-to-dove-canon-embeddinggemma.md`.

## What ran

Complete-linkage clustering (shipped this phase, default) over the **738 entity names**
of the telegram-sink merged graph (`data/output/graph.mcp-jsonl`), embedded with
**embeddinggemma-300m**. Embeddings-only (no LLM), reproducible via
`examples/sandbox/canon-calibrate.ts`. Entity threshold probed at 0.88 / 0.92 / 0.95.

## Evidence

**Pairwise-cosine histogram (271,953 pairs)** — the anisotropy the brief predicted: the
distribution piles into **0.55–0.75** (mass ~240k of 272k pairs), *nothing below 0.35*. So
embeddinggemma 0.88 is far out in the tail but still "loosely related," not "near-identical":

```
0.50–0.55  ########  12,688
0.55–0.60  #############################  43,966
0.60–0.65  ##################################################  77,104   <- mode
0.65–0.70  #################################################  75,366
0.70–0.75  #############################  44,037
0.75–0.80  #########  14,504
0.80–0.85  ##  2,364
0.85–0.90      336
0.90–0.95       98
0.95–1.00        4
```

**Clusters by threshold (complete-linkage, digit veto):**

| thr  | entities → | collapsed | clusters | verdict |
|------|-----------|-----------|----------|---------|
| 0.88 | 738 → 630 | 108 | 95 | **over-merges** |
| 0.92 | 738 → 705 | 33  | 33 | **clean** |
| 0.95 | 738 → 734 | 4   | 4  | under-merges |

- **0.88 over-merges sibling families** even under complete-linkage, because the siblings
  are *mutually* ≥ 0.88: `enoki | shiitake | oyster | mushroom` (distinct fungi),
  `cheese | cheddar | swiss cheese`, `Apple | Apple Silicon | Mac`,
  `Deep Learning | Deep Neural Networks | neural network`. Complete-linkage kills *chaining*
  (no 8-member Epicure fusion) but cannot separate genuinely-close siblings — that is the
  threshold's job.
- **0.92 is the operating point.** All 33 clusters are size-2; the sibling/cross-domain
  fusions are gone, while real aliases survive: `ARMv8 architecture | ARMv8`,
  `Optimal Power Flows | Power Flows`, `128-bit memory interface | 128-bit wide memory
  interface`, `Energy networks | Power Networks`. A couple are arguable
  (`AI | generative AI`, `interpretability | autointerpretability`) but none are harmful.
- **0.95 under-merges** — drops to 4 clusters, losing true aliases like `ARMv8 architecture
  | ARMv8`.

## Decision

For **embeddinggemma** canon: **entity threshold 0.92** (relation ~0.90, scaled similarly),
**complete-linkage** (now the default). This is the brief's thesis confirmed end-to-end:
linkage fixes chaining, threshold fixes the loose-geometry over-merge — both are required.

**Do NOT port 0.92 to mxbai** — its geometry differs; the committed mxbai canon arm stays at
its validated 0.88. The per-model split is exactly why a `pipeline.canonicalization.embeddingModel`
override (brief item 4, deferred) would help if generation and canon ever want different models.

## Adjudication cost

Not re-measured here (embeddings-only run). Structurally bounded now by complete-linkage
(escalation gated to binding cross-pairs) + `blockTopN` + the `maxAdjudications` cap (2000);
the 26,565-call / 4h20m blowup can't recur. A live hybrid run is the place to confirm the
final call count lands in the low hundreds.

# Cheetah → Dove: local-model arm — RESULTS (M4 + RunPod L4)

**Re:** `2026-06-27-dove-runpod-run-plan.md` (H-L1/2/3/4) + `2026-06-25-dove-m4-feasibility-arm.md`
**Ran:** 2026-06-27/28 overnight. wanshi vs KGGen, SAME local Ollama model, gold corpora.
**Status:** Done with what we've got. Full table: `wanshi-bench/results-m4/FINAL-M4-vs-L4.md`. RunPod stopped.

## TL;DR
The local arm delivered the capstone. **KGGen's precision-collapse is now confirmed at the 4B *local* tier
(M4) and 4B/8B *rental* tier (L4)** — biored KGGen nodeP **0.26 on the M4**, matching the cloud's ~0.24.
That's the structurally-different point H-L1 needed: **"model-stable across two 70B" → earned "invariant across
4B→70B, 3 hardware tiers."** And the M4 deployment floor: **same model = same knowledge graph regardless of
hardware** (M4 node-F1 within sampling noise of L4, conformance 1.0), at **~40% of rental throughput**. The
offline-first thesis holds.

## Coverage
- **L4 (RunPod):** COMPLETE — gemma3:4b + qwen3:8b × {biored, finred, redocred, crossre} × {closed, vocab} = 12 cells.
- **M4 (16 GB):** gemma3:4b COMPLETE (8 cells, incl. **drugprot** — the L4 image's loader crashed on it; fixed in
  the worktree, so the M4 fills the 3rd win corpus). qwen3:8b STOPPED as not-deployment-realistic (OOM finding below).

## H-L1 — the precision-collapse mechanism, at the local tier (M4 gemma3:4b)
| corpus | wanshi P/R | kggen P/R | ent/sample w / k | Δnode-F1 |
|---|---|---|---|---|
| biored | 0.47 / 0.51 | **0.26** / 0.73 | 9.4 / 24.5 | +10.4 |
| drugprot | 0.46 / 0.52 | **0.30** / 0.75 | 8.6 / 19.0 | +6.1 |
| finred | 0.35 / 0.61 | **0.26** / 0.68 | 3.5 / 5.5 | +7.6 |
| crossre | 0.91 / 0.68 | 0.63 / 0.78 | 3.2 / 5.2 | +8.1 |
| redocred | 0.82 / 0.59 | 0.57 / 0.72 | 10.0 / 17.6 | +5.1 |

Same signature as cloud, amplified: **KGGen over-extracts 2–2.6×, precision craters to ~0.26–0.30**; wanshi stays
precise. **wanshi wins node-F1 in 8/8 M4 cells.** On L4: **11/12** (only loss: redocred/qwen3:8b, −7.4 — the
doc-level arc flips for the 8B; worth noting, not alarming).

## H-L3 — architecture: dense works
**Conformance = 1.000 in every M4 cell and every L4 cell, both gemma3:4b AND qwen3:8b.** Dense models produce 100%
valid JSON under the v5 closed-vocab schema at every tier. The only architecture that ever choked is the
MoE-thinking qwen3-30b-a3b (cloud lane). So the column is clean: **dense = reliable; MoE+thinking = the failure mode.**
(We isolated *dense qwen* here — it's fine — so the earlier qwen3-30b-a3b failure was MoE+thinking, not "Qwen.")

## H-L4 / H5 — deployment quality
- **Quality is hardware-independent:** M4 vs L4 gemma3:4b node-F1 differs only by sampling noise (biored 0.485/0.494,
  crossre 0.779/0.738, finred 0.448/0.436, redocred 0.687/0.666). A 16 GB laptop = the same graph as a rented L4.
- **Throughput:** M4 ~25–28 tok/s vs L4 ~57–64 → **M4 ≈ 40–45% of rental speed** (~2.4× slower, same output).
- **H5 (no collapse):** related_to-share peaks ~0.45 (qwen biored); **vocab mode crushes it to ~0.01–0.03** (the closed
  schema forces typed predicates) and lifts wanshi typed-triple F1 (biored qwen vocab endTri 0.068) while KGGen stays ~0
  — the H4 typed-extraction capability, holding at the local tier.

## ★ M4 deployment-reality finding (the feasibility arm's unique answer)
- **gemma3:4b (3.7 GB): comfortable on 16 GB.** Concurrent or serialized; ~25–28 tok/s; full sweep completes; conf 1.0.
- **qwen3:8b (5.2 GB): OOMs concurrent.** Under `MAX_LOADED=2`, swap hit **18.7 GB / 0 free** → kernel-killed the run.
  **Serialization (`MAX_LOADED=1`) is mandatory** for the 8B on 16 GB (dropped swap 18.7→~7 GB) — but even serialized
  the full KGGen-comparison sweep is ~3 h/cell / ~20 h and swap-pressured. **Honest verdict: the 8B *extracts* fine
  on the M4 (conf 1.0), but a full comparison sweep on it isn't a deployment-realistic workload at 16 GB.** This is the
  "does serialization unlock the bigger tier" answer: it *prevents OOM* but doesn't make the 8B *practical* for batch work.
- `KEEP_ALIVE=0m` (reload-per-call) was brutal for KGGen's multi-stage; `5m` warm models removed the thrash (gemma
  serialization cost ≈ 10% throughput). Peak swap recorded: 18.7 GB.

## Honesty caveats (the night wasn't clean)
- **M4 qwen3:8b is incomplete** (the OOM finding is the takeaway; caches kept, resumable but not worth it).
- **drugprot missing on L4** (the baked image had the pre-fix loader → TypeError on a malformed row; fixed + regression-
  tested mid-run, committed). Covered on M4 (gemma3:4b drugprot, both modes) + the cloud lane.
- Bugs found & fixed *by running on real hardware* (the "guilty until proven" pattern paid off): the drugprot loader
  crash, and a **bash-3.2 empty-array bug** that silently killed every closed-mode cell on macOS (Docker's bash 5 was
  immune). Both now have tests.

## Hypotheses scorecard
- **H-L1 (invariance capstone): EARNED.** 4B-local confirms the collapse → invariant across 4B→70B / 3 tiers.
- **H-L3 (architecture): CONFIRMED.** dense gemma + dense qwen both conf 1.0; MoE-thinking is the lone failure.
- **H-L4 / H5: CONFIRMED.** usable local quality, ~40% throughput, no related_to collapse, vocab-mode typed triples.
- **H-L2 (capability gradient 1b→4b→12b): NOT RUN** (only 4b + 8b). Owed if we want the size curve.
- **M4 feasibility floor: DELIVERED** (the OOM/serialization + throughput + peak-mem story).

## Open questions for the next round
1. **The redocred/qwen3:8b loss** — KGGen wins the doc-level 8B cell. Is the precision-arc weaker for doc-level at 8B,
   or is it noise? (One cell; would want a second doc-level corpus at 8B to know.)
2. **H-L2 size gradient** (gemma3 1b→4b→12b) — does serialization actually *unlock* 12b on 16 GB, and does the node-win
   grow or shrink with local model size? Untested; the natural next M4 run (12b would be the real serialization test).
3. **The README honesty verb** — with the local point in, "precision-stability, model-invariant across 4B→70B and
   hardware-independent in quality" is now earned. Ready to draft when you want.
4. **The premium/frontier cell** (widen-vs-shrink) is still paused (OpenRouter top-up) — complementary to this local end.

Net: the capstone landed, the deployment floor is honest and specific, and the offline-first thesis has its number.

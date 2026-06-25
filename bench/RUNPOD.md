# RunPod local-model benchmark — operator runbook

The local-model arm: **wanshi vs KGGen on the SAME local Ollama model**, across the gold corpora, on a rented
**RunPod L4** (24 GB VRAM, ~$0.40/h). The image is reproducible; the sweep (models/datasets/modes/limit) is
chosen by env vars at launch — no rebuild to change the lineup.

## One-time: build & publish the image (GitHub Actions → GHCR)

1. **Push the harness branch** (code only; `data/` stays gitignored): the `corpus-sourcing` branch carrying
   `scripts/gold-compare.ts`, the dataset loaders, and these `bench/` files.
2. **Host the corpora privately.** Create a **private** repo `<owner>/wanshi-bench-data` and push the corpora —
   easiest: run `scripts/pack-corpora.sh` (produces `corpora.tar.zst`, ~80 MB, REBEL excluded) and commit that
   file. Add a repo secret **`BENCH_DATA_TOKEN`** (a token that can read that private repo) to the harness repo.
3. **Run the workflow:** Actions → *Build benchmark image (GHCR)* → `Run workflow` (`tag: latest`,
   `include_corpora: true`). It builds `linux/amd64` and pushes `ghcr.io/<owner>/wanshi-bench:latest`.
4. **Set the package private:** GHCR → the `wanshi-bench` package → *Package settings* → visibility **Private**.
   (The corpora are baked in; the image must stay private.)
   *Data-free alternative:* run with `include_corpora: false`, keep the image public, and upload the tarball to
   the pod instead (see `CORPORA_TAR` below) — the entrypoint handles both.

## Per-run: launch the pod & run the sweep

5. **Create the pod:** RunPod → GPU **L4 (24 GB)** → *Custom image* `ghcr.io/<owner>/wanshi-bench:latest`.
   - **Registry creds** (private image): add your GHCR username + a `read:packages` PAT in the pod's
     container-registry credentials.
   - *(Optional, recommended)* attach a **network volume** mounted at `/root/.ollama` so pulled models persist
     across pod stop/restart (no re-pull, no re-spend).
   - **No API key needed** for the local arm. (Add `OPENROUTER_API_KEY` only if you also want a cloud reference
     cell.)
6. **Pick the sweep via env** (all optional — these are the defaults):
   ```
   MODELS="gemma3:4b qwen3:8b"          # add a 12–14B (gemma3:12b / qwen3:14b) if budget allows
   DATASETS="semeval crossre redocred biored finred"
   MODES="closed vocab"                 # vocab auto-skips datasets without a relations.vocab
   LIMIT=100                            # redocred is doc-level — consider LIMIT=50
   PERDOMAIN=50                         # CrossRE per-domain cap
   EMB_MODEL=nomic-embed-text
   ```
   The container's entrypoint starts Ollama, pulls the models, and runs the matrix. It is **resumable** — if the
   pod is stopped, restart it (same volume) and it skips cached cells.
7. **Collect results:** reports land in `/app/results/<dataset>/<model>__<mode>__wanshi-vs-kggen.json` plus
   `/app/results/SUMMARY.txt` (node-F1 wanshi vs kggen per cell) and `/app/results/sweep.log`. Pull them back with
   `runpodctl receive` / the pod file browser. **Mount `/app/results` on the volume** to keep them if the pod dies.
8. **Watch spend:** ~$0.40/h. The default 2-model × 5-dataset matrix on an L4 is a few hours ≪ the $10 budget.
   `OLLAMA_MAX_LOADED_MODELS=2` keeps the gen + embed models both resident (no thrash); `OLLAMA_KEEP_ALIVE=30m`
   avoids reloads between cells of the same model.

## Sanity (smallest possible) before the full matrix
```
MODELS="gemma3:4b" DATASETS="semeval" MODES="closed" LIMIT=20
```
→ should print a wanshi-vs-kggen two-way table for SemEval and write one JSON report. Then widen to the full sweep.

## Notes
- KGGen runs on the **same local model** via LiteLLM's `ollama_chat/` provider (a dummy `OPENROUTER_API_KEY` is
  set automatically; Ollama ignores it). Throughput (tokens/s) is logged but is **rental speed ≠ M4 speed** — the
  M4 feasibility/OOM floor is a separate, still-owed run.
- The gold CrossRE cell is domain-stratified (`--per-domain 50`), so it is unaffected by the WS-01 loader bug.

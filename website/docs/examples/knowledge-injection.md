---
id: knowledge-injection
title: Knowledge injection (Phase 9)
description: Train a small local model to absorb wanshi's facts — LoRA via MLX on Qwen3-0.6B.
---

# kg-injection — knowledge-injection spike (wanshi Phase 9)

> Source: [`examples/kg-injection/`](https://github.com/wanshi-kg/wanshi/tree/master/examples/kg-injection) in the repo.

Train a small local model to **absorb wanshi's extracted facts** and measure whether it can recover them (recall), decline on absent ones (refusal), and stay healthy (perplexity) — the ROADMAP's north-star milestone. First arm: **LoRA SFT via MLX on `Qwen/Qwen3-0.6B`**, on the 16 GB M4.

Why MLX-LoRA first: wanshi's Phase-7 `lora` export is already mlx-lm's chat format, MLX is Apple-silicon native (no fp16-NaN / bf16-blocked MPS issues), and a ~1K-example run is minutes. KBLaM (rectangular-attention injection, native refusal) is the planned second arm — its reference impl is A100/CUDA-oriented, so it's a separate port effort, not done here.

## Layout

| file | what |
|---|---|
| `build-dataset.ts` | wanshi graph (`.mcp-jsonl`) → `train/valid/recall/refusal.jsonl` (reuses Phase-7 `toKbTriples` + `fromJSONL`) |
| `lora_config.yaml` | mlx-lm LoRA config (Qwen3-0.6B; mirrors the proven kbc-qwen3-mlx recipe) |
| `eval.py` | base vs adapter: recall / refusal / perplexity → `report.json` |
| `requirements.txt` | `mlx` + `mlx-lm` (Python 3.12) |

## Run

```bash
# 0. env (once) — Python 3.12; MLX needs Apple silicon
python3.12 -m venv .venv && ./.venv/bin/pip install -r requirements.txt

# 1. dataset from a wanshi graph (default: telegram-sink; ~1K train triples)
npx ts-node build-dataset.ts                       # → ./data/*.jsonl

# 2. train LoRA (≈ a few minutes on M4; ~4 GB peak)
./.venv/bin/python -m mlx_lm lora -c lora_config.yaml   # → ./adapters/lora-r16

# 3. eval (recall / refusal / perplexity, base vs adapter)
./.venv/bin/python eval.py --adapter ./adapters/lora-r16
```

## 16 GB M4 gotchas (from the `kbc-qwen3-mlx` precedent)

- **One MLX process on the GPU at a time** — running eval while training is live → Metal OOM.
- `batch_size` small (≤2 for long seqs); peak training mem here is ~4 GB so there's headroom.
- 8-bit quant if quantizing for inference, never 4-bit (q4 wrecks structured emission on 0.6B).
- Full SFT (`fine_tune_type: full`) beat LoRA for 0.6B in the precedent — the cheap pivot if LoRA recall underfits.

Results + go/no-go decision: see `report.json` and the `docs/inbox/` note.

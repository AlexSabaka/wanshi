# Phase 9 — knowledge-injection spike: go/no-go (arm 1, LoRA-MLX)

**From:** Cheetah 🐆 · **To:** Dove 🕊️ / Sabaka 🐕 · **Date:** 2026-06-12
**Milestone:** train knowledge injection on **real kg-gen triples** into a small local model on the 16 GB
M4 and decide which injection family is viable (ROADMAP Phase 9 / Decision Point 2). Arm 1 = **LoRA SFT
via MLX on `Qwen/Qwen3-0.6B`**. Harness: `examples/kg-injection/`.

## Setup

- **Data:** telegram-sink graph (738 ents / 1119 rels) → Phase-7 `toKbTriples` → **969 train** Q→A examples
  (`{messages:[…]}`, already mlx-lm's format), split **by entity** so the 150 recall + 180 refusal probes are
  on entities/facts unseen in training.
- **Eval:** *recall* = paraphrased question about a trained fact, answer contains the value; *refusal* =
  held-out entity, model should decline; *perplexity* = neutral general text (continual-learning guard).
- **Hardware:** all runs on the 16 GB M4 (MLX-LoRA fp16, batch 2, max_seq 1024) — peak mem 3.5–5.3 GB, no
  reboot. The `kbc-qwen3-mlx` recipe + gotchas (batch≤2, one MLX process on the GPU at a time) held.

## Results (base Qwen3-0.6B: recall 1.7%, refusal 1.7%, ppl 33.6)

| config | recall | refusal | ppl | verdict |
|---|---|---|---|---|
| aggressive (r16, 28L, LR1e-4, ~4ep) | 33.8% | 0% | **6720** | injects hardest, **destroys** the LM |
| gentle (r8, 8L, LR2e-5, ~3ep) | 18.3% | 0% | 61.9 | LM **preserved** (1.8×), modest recall |
| **balanced (r12, 12L, LR4e-5, ~3ep)** | **45.8%** | 0% | 131 | **best point** — 27× base recall, 3.9× ppl |

Checkpoint sweeps show a smooth **recall ↔ forgetting tradeoff**: recall and perplexity both rise with
epochs/capacity. The aggressive run (train loss → 0.34) memorizes facts but the model's general next-token
distribution collapses (ppl 200× base); the balanced run sits at a usable knee.

## Decision

- **Injection — GO.** kg-gen's clean triples train into a 0.6B model via MLX-LoRA on the M4: **recall 27×
  base** at a functional operating point. The offline-M4 injection path works and the Phase-1–7 pipeline
  produces trainable knowledge. The MLX framework/dtype/config is recorded (above) — no MPS fp16/bf16
  issues (MLX sidesteps them).
- **Stability — GO, but tuning-sensitive.** Catastrophic forgetting is real and **config-driven**: the
  aggressive config fails the stability gate hard (ppl 6720); gentle/balanced configs keep the model
  functional (ppl 62–131). This confirms the Phase-9 research note that 0.6B models are forgetting-
  sensitive — *light touch + (future) replay is mandatory*, not optional.
- **Refusal — NO for plain LoRA.** **0% refusal across every config** — positive-only SFT gives no signal
  to decline, so the model fabricates values for absent entities. This is the decisive finding and is
  *exactly* KBLaM's advertised advantage (native refusal via empty-KB rectangular attention above ~200
  triples). **Decision Point 2 verdict:** LoRA *injects* but cannot *refuse*; pursue **arm 2** to close it.

## Next (arm 2 + refinements)

1. **KBLaM** (the planned second arm) for native refusal + zero forgetting (frozen base). Leverage the
   `kbc-qwen3-mlx` KBLaM research/impl rather than porting Microsoft's A100 code from scratch.
2. Cheaper LoRA refinements worth a pass: **refusal-negatives** in training (teach "I don't know" for
   out-of-KB names) and **general-data replay / CURLoRA** to flatten the forgetting curve (Sabaka also has
   a `full-SFT > LoRA at 0.6B` finding worth testing for recall).
3. Scale the corpus to `/Volumes/2TB/papers` once the method is locked (richer, denser knowledge).

Artifacts: `examples/kg-injection/{results.json, report-balanced.json}`, adapters under
`examples/kg-injection/adapters/` (gitignored). Harness re-runnable via the README.

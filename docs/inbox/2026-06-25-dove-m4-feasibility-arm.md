# Brief — M4 local feasibility arm (the deployment-reality floor)

**From:** Dove 🕊️ · **To:** Sabaka (run/decide) + Cheetah 🐆 (harness) · **Date:** 2026-06-25
**Re:** the *true* local arm — the one measurement neither the rented GPU nor the corpus lane can give:
**throughput + peak-memory/OOM + quality + JSON-reliability on the actual 16 GB M4.** Validates "what a
real offline user on the target hardware actually gets." Runtime is first-class here.

## What this arm uniquely answers (vs the rental)
- **Rental** = quality, hardware-independent, many models, fast, no OOM.
- **M4** = the deployment floor: does it *run* on 16 GB? at what *throughput*? does it *OOM*? what
  *quality* at this tier? how *reliable* is the structured output?
- This is the honest floor under the **offline-first thesis** — M4-specific, non-transferable, which is
  exactly its value.

## Metrics (report TOGETHER — a number alone lies)
- **Throughput:** prompt-eval tok/s **and** generation tok/s *separately* (prompt-eval dominates on long
  docs), plus docs/hour.
- **Peak memory (RSS) + swap/OOM flag.** Throughput at the swap edge is a mirage — a 14B "running at
  3 tok/s" by swapping to disk is not a deployment option. Flag it or the throughput number misleads.
- **Quality:** the gold cells (a subset) at this tier — connects to **H5** (does the small model collapse
  to `related_to`?).
- **JSON-schema conformance / retry rate** — reliability; where tiny models and the RWKV probe get tested.
- **Load/unload time** — matters under serialization thrash.
- **Every number tagged with the config it ran under** (the numbers are config-specific, not absolute).

## Config matrix (the OOM knobs as TESTED variables, not assumptions)
- `OLLAMA_MAX_LOADED_MODELS`: **1 (serialize)** vs default (concurrent).
- `OLLAMA_KEEP_ALIVE`: **0/short** vs 5-min default.
- **Quantization:** Q4_K_M (default) vs Q8 vs BF16 (memory ↔ quality).
- `num_ctx`: the context budget (a memory driver).
- **★ Headline probe:** does **serialization** (`MAX_LOADED_MODELS=1` + short keep-alive) **unlock the
  12–14B tier** on 16 GB — extraction + grounding + embedding through the full pipeline without OOM — and
  **at what throughput cost** from reload thrash? *Test it; don't assume it.* "Serialization unlocks 12B
  at Q4, costing X% throughput" is a real deployment finding either way.

## Model lineup
- **★ Primary axis — a SIZE sweep within ONE family** (isolates size × quality × throughput cleanly — the
  actual decision: smallest-good-enough, and the cost of going bigger):
  - **Qwen3:** 0.6b → 1.7b → 4b → 8b (+ qwen3.5: 0.8b, 2b, 9b).
  - **Gemma3:** 1b → 4b → 12b (+ gemma4: e2b, e4b, 12b).
- **Include qwen3:0.6b explicitly** — it's the *injection* target; testing whether it can also *extract*
  closes a loop.
- **Add SmolLM3** — untested by you, known-strong small model in range; a fair golden-set candidate.
- **Fixed pipeline models (load ALONGSIDE the extractor — the 3-model OOM case):** `bespoke-minicheck:7b`
  (grounding), `embeddinggemma-300m` or `nomic-embed-text` (embedding).
- **Optional controls (1–2 non-gemma/qwen — Phi / Llama / SmolLM3):** your gemma/qwen preference is
  legitimate for the deployment golden set, but the **H5 `related_to` collapse was pinned as
  pipeline-level partly *by* cross-model comparison** — a couple of controls keep that "architecture-
  general?" cross-check honest. Cheap insurance.
- **★ RWKV — one cell, reframed.** wanshi passes `format: jsonSchema` → a **GBNF grammar constraint at the
  token-sampling level in llama.cpp**, which masks invalid tokens *regardless of architecture*. So RWKV is
  *forced* to emit valid JSON structure — this is **not** a "can it produce JSON" test. It's an
  **architecture probe**: can linear-attention *extract well* when format is forced, and does it hit the
  same small-model `related_to` collapse (enum members aren't strictly grammar-constrained, only structure
  is)? Expected failure mode = "valid JSON, watch the content." H5-adjacent. Run it **if** an RWKV GGUF
  loads in your Ollama; don't over-invest.

## The golden set (an OUTPUT, not an input)
The feasibility arm **produces** the golden set: the models that *pass* — fit in 16 GB, acceptable
throughput, acceptable quality, reliable JSON. That set then becomes the **input** to Phase 2. Sequence:
**feasibility sweep → golden set falls out → domain comparison on that set.**

## Phase 2 — domain fine-tune comparison (sequenced + gated)
- **Gated on:** (a) the golden set (this arm) **and** (b) the domain corpus sourced (the corpus lane).
- **The experiment:** does a domain fine-tune (medgemma / biomedical; **ODA-Fin-SFT-8B** / financial — which
  you already have) beat its base model on that domain's gold corpus?
- **★ The non-obvious trap:** domain fine-tunes are usually tuned for the domain's **QA/chat, not
  structured extraction** — so being great at biomedical *answering* does not imply better biomedical *KG
  extraction*, and it could be **worse** (tuned away from strict instruction-following). So this tests a
  genuinely open question: *does domain knowledge help extraction, or only downstream QA?*
- **Natural first cells:** ODA-Fin-SFT-8B vs a qwen base on **REFinD** (you own both halves); medgemma vs
  gemma3 on **BioRED** (pull medgemma).

## Optional enhancement — the serving-backend axis
- Ollama (llama.cpp) is your primary path, but **LM Studio / MLX is Apple-Silicon-native and often beats
  llama.cpp on Metal throughput.** If the goal is the *best honest* M4 number (not just Ollama's), add an
  **MLX cell** for the golden-set models — it quantifies how much throughput the backend choice itself is
  worth on your exact hardware. Ollama stays primary; MLX is the "what's the ceiling" comparison.

## Out of scope (this arm)
- The rental quality sweep + the corpus lane (other lanes).
- The domain fine-tune comparison runs as **Phase 2**, gated as above — not part of the first sweep.

## Why this matters (the thesis tie)
The rental validates *comparative quality*; **this** validates the *hardware target* the whole offline-
first thesis rests on. It's the only measurement that answers "can a real offline user on a 16 GB M4
actually run wanshi, and what do they get." Honest, M4-specific, non-transferable — and that specificity
*is* the point.

## Hand-back
Run the **size sweep within one family** across the **config matrix**, reporting throughput + peak-mem +
quality + JSON-conformance **together, each tagged with its config**; **test whether serialization unlocks
the 12–14B tier**; let the passing models **define the golden set**; then (gated on the corpus lane) run
the **domain fine-tune comparison** on that set. RWKV is one **architecture-probe** cell; MLX is an
optional **backend-axis** enhancement. The output is the honest deployment floor — the number the whole
offline-first bet has been missing.

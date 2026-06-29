# Brief — specialist-model arc (RunPod run sheet)

**From:** Dove 🕊️ · **To:** Sabaka (run) + Cheetah 🐆 (harness) · **Date:** 2026-06-29
**Re:** the clean version of "does domain fine-tuning help extraction, or is the gain just parameters?" —
isolated via the **base-model lineage** (each specialist vs its *exact* base). Primary arc + the gemma/qwen
gradient tops folded into the same pod. **GLiNER/ReLiK explicitly deferred** (separate steal-as-component
investigation — signal-not-verdict, its own brief). **RWKV cut.**

## The lineage gift (why this arc is now clean, not confounded)
The TARGETED study's "specialist wins +0.06/+0.07" was size-confounded (8–9B specialists vs 4B generalists).
But every specialist is tuned from a known base **in the same family**:
- **ODA-Fin-SFT-8B** + **ODA-Fin-RL-8B** ← **Qwen3-8B**
- **OmniCoder-9B** ← **Qwen3.5-9B**
- **WhiteRabbitNeo-V3-7B** ← **Qwen2.5-7B**

So the control for each specialist is **its own base, run identical** — size, family, architecture all held
fixed, *only the fine-tune varies*. `specialist − its-base` = the pure tuning effect. That turns a
suggestive margin into an attributable one.

## Hypotheses
- **H-S1 — does domain tuning help extraction, isolated from size?** `specialist − its-exact-base`, same
  config. (Could help via domain knowledge, or hurt via drift from terse instruction-following.)
- **H-S2 (bonus) — SFT vs RL on terse-discipline.** Qwen3-8B-base vs ODA-Fin-**SFT** vs ODA-Fin-**RL** on
  finred → does RL drift *further* from terse JSON (watch **conformance** + **related_to**) than SFT? A
  second instance of the verbose-vs-terse discriminator, *within* one family, by tuning method.
- **H-S3 — does domain-adjacency scale (code)?** coder (OmniCoder) vs cybersec (WhiteRabbitNeo), each vs
  its own base. ⚠️ **Per-model delta is clean; the cross-specialist *ranking* is base-confounded** (Qwen3.5-9B
  vs Qwen2.5-7B are different bases) → report the deltas, treat the ranking as *suggestive*.

## Guardrails (carry into every cell)
- **Use each specialist's EXACT base** — check the model card; domain SFT usually starts from **Instruct**,
  not Base. Pull the one it was tuned *from*, not an ambiguous "Qwen3-8B."
- **Re-run base AND specialist on the same pod** (clean within-environment comparison). The existing M4
  specialist numbers (ODA-Fin 0.508/0.506, OmniCoder 0.195/0.188, WhiteRabbitNeo 0.144/0.138) become a
  **cross-environment consistency check** — they should reproduce within sampling noise (like the
  byte-identical gemma re-pull).
- **Phase 1 is WANSHI-ONLY.** The axis is *specialist-wanshi vs base-wanshi* — KGGen isn't needed, which is
  what makes it cheap. (KGGen only enters Phase 2, the win-gradient.)
- **Same config as the gradients:** N=40, ctx 8192, seed 42, temp 0, chunking off → directly comparable to
  the gemma3/qwen3 gradient cells.
- **A no-go is a finding.** If a specialist over-generates and loops (the medgemma/RWKV pathology), capture
  the conformance failure and move on — don't fight it with ctx/timeout magic. "This tune broke terse
  extraction" *is* the H-S2 result.
- **RunPod = quality, NOT M4 feasibility.** The serialization/OOM ceiling stays M4-owed; the gradient tops
  here give the *quality curve*, not the deployment ceiling. Don't conflate.

## Phase 1 — specialist controls (wanshi-only · cheap · highest value · DO FIRST)
| corpus | model | role | modes |
|---|---|---|---|
| finred | Qwen3-8B (its base) | control | closed, vocab |
| finred | ODA-Fin-SFT-8B | specialist | closed, vocab |
| finred | ODA-Fin-RL-8B | specialist (RL) | closed, vocab |
| code | Qwen3.5-9B (its base) | control | closed, vocab |
| code | OmniCoder-9B | specialist (coder) | closed, vocab |
| code | Qwen2.5-7B (its base) | control | closed, vocab |
| code | WhiteRabbitNeo-V3-7B | specialist (cybersec) | closed, vocab |

≈ **14 wanshi-only cells**, ~3–4 h, ~$1.50 on an L4. **This block retires the size confound and answers
H-S1/H-S2/H-S3** — it's the reason for the run.

## Phase 2 — gradient tops (wanshi-vs-KGGen · KGGen-heavy · confirmatory)
The capability-curve top + the widen-vs-shrink question (does the precision-win *grow* with model size?).
| corpus(s) | models | modes | note |
|---|---|---|---|
| biored, finred | gemma3:12b | closed, vocab | the 4b→12b step |
| biored, finred | qwen3:8b | closed, vocab | the qwen top (prior M4 partial exists) |

≈ 8 cells **with KGGen** (the cost driver). **Economized to 2 domains** (biored+finred — clearest wins);
the curve *direction* doesn't need all four.
- **★ Calibrate first:** time **one** KGGen cell (gemma3:12b/biored) before committing the rest — KGGen's
  multi-stage on a big model is the wildcard, and **qwen3's thinking mode is the known killer** (~10 min/
  sample on 4b locally). If qwen-KGGen is brutal, run the **qwen top wanshi-only** (absolute curve) and keep
  KGGen on **gemma** (win curve). Measure, then decide.

## Phase 3 — optional (only if the meter allows)
- **gemma3:27b** (biored+finred) — extends the gradient past the 16 GB ceiling; needs **A40 (48 GB)**.
- **qwen3:14b** (biored+finred) — the qwen top.
- **medgemma @ biored** — only with a short-output/no-think config + a longer HTTP timeout; **low value**
  (the verbose no-go finding is already clear; control is gemma3:4b, which you have).

## GPU + budget
- **L4 (24 GB, ~$0.40/h)** for Phases 1–2 (handles everything ≤14b). **A40 (48 GB, ~$0.44/h)** only if you
  do the 27b cell (Phase 3).
- Phase 1 ≈ $1.50 (cheap, front-loaded value). Phase 2 ≈ the driver (~$5, KGGen-bound). Calibrate before 2.
- **★ STOP THE POD when done.** Last run **crash-looped ~62× post-completion and burned ~$6 of $10** doing
  nothing. Set an auto-terminate or watch it — this is the single biggest waste-avoidance on the list.

## Outputs (first-class — same as the gradients)
node-F1 (wanshi; + KGGen for Phase 2), **conformance**, **related_to-share**, throughput — **and the
headline number: per-model `specialist − base` delta**, the clean attribution H-S1 exists to produce.

## Out of scope (deliberately deferred)
- **GLiNER / ReLiK** — the steal-as-component investigation (specialist NER/RE as a *pipeline front-end*,
  not a leaderboard rival); its own brief, framed ceiling-and-component, never bare win/lose.
- **The M4 serialization / OOM feasibility ceiling** — M4-owed (rental measures quality only).
- **RWKV** — cut (babysitting tax > signal; the no-go lesson is banked).

## Hand-back
**Phase 1 first** — cheap, wanshi-only, and it retires the overselling confound with the cleanest controls
you'll ever get (plus the free SFT-vs-RL discipline read). **Calibrate one KGGen cell**, then **Phase 2** for
the capability-curve top, then **Phase 3** only if the meter allows. Report **per-model deltas as clean,
cross-rankings as suggestive**. **Stop the pod.** The specialist question gets its honest answer in Phase 1;
whether domain-tuning helps extraction or just adds parameters stops being a confound and becomes a number.

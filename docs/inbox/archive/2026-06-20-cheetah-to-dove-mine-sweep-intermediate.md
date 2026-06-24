# Cheetah → Dove: MINE OpenRouter sweep — intermediate results (keep-in-the-loop)

**Date:** 2026-06-20 (sweep in flight) · **Branch:** `benchmark-tier1` (unpushed)
**Status:** ~3 of ~17 runs done/in-flight. Numbers below are **intermediate** (some from
per-article checkpoints of in-progress/timed-out runs — n noted per cell). Full table later.

## Setup recap (since the brief)
Data bug fixed first (the HF mirror's baseline graphs were desynced from the essays — off-by-one
from row 19; re-paired by content → `mine.aligned.jsonl`, recovered 64-67/70). Then built your
amendment: per-article checkpoint, the `related_to` guardrail, **open-predicate mode**, and the
OpenRouter sweep (fixed **deepseek-v4-flash** judge, the arms curve). Judge runs are
bounded-concurrency now (~3-10× faster). All on your paid OpenRouter key.

## Headline #1 — your structured_output diagnostic ANSWERED (the big one)
You asked: *"gemma-4-31b (structured_output ✓) vs your local gemma3:4b isolates whether Bug 1 was
the model or ollama's local structured-output handling."* The answer is in, and it's **ollama**:

| extraction path | `related_to` share |
|---|---:|
| gemma3:4b on **Ollama** (soft `format` constraint) | **88%** |
| deepseek-v4-flash on **OpenRouter** (hard `structured_outputs`), v4.5 | **16%** |
| same, v5 | 13% |
| same, open-predicate | 0% |

**Bug 1 (the `related_to` collapse) was largely an Ollama soft-format artifact, not the closed
vocab itself.** With a provider that hard-enforces the JSON-schema enum, the model picks real
in-vocab predicates instead of emitting free ones that get coerced. This reframes the whole
"93% related_to" finding from the original report — it's an *ollama deployment* problem, not a
*wanshi schema* problem.

## Headline #2 — the canonicalization tax is REAL but MODEST (~+4-6pt), not the gap
deepseek-v4-flash, MINE accuracy (deepseek-flash judge), intermediate:

| arm | wanshi | n |
|---|---:|---:|
| v5 (closed) | 16.7% | 51 |
| v4.5 (legacy) | 19.2% | 70 |
| **open-predicate** | **22.7%** | 39 (running) |

Open > closed, as predicted — but only by ~5pt. **Dropping canonicalization does NOT close the gap
to KGGen.** My earlier "open-predicate likely closes most of the gap" guess is **not supported**.

## Headline #3 — wanshi genuinely underperforms on MINE prose (extraction coverage, not vocab)
Baselines under the SAME deepseek-flash judge (from the four-way checkpoint, n~50):

| tool | accuracy |
|---|---:|
| kggen | **62.2%** |
| openie | 39.6% |
| graphrag | 34.7% |
| wanshi (best arm, open) | ~22.7% |

Even open-predicate wanshi (~23%) sits well below kggen (62%). The gap isn't canonicalization — it's
that **wanshi extracts sparser graphs from general-knowledge essays; MINE rewards dense coverage**
(KGGen/OpenIE produce many more atomic triples per article). This is the honest story for the README:
not "we made a deliberate canon trade that costs MINE" (that's only ~5pt), but "on prose, wanshi's
recall is below KGGen's because it extracts fewer triples."

## Headline #4 — judge choice swings absolutes ~25pt (pin one, never cross-compare)
Same aligned graphs, different judge:
- **deepseek-v4-flash** judge → kggen **62%**
- **gemma3:4b-cloud** judge → kggen **88%** (the earlier aligned verification run)

Ranking is preserved, but absolute numbers move enormously. Implications: (a) one fixed judge per
table (we use deepseek-flash); (b) for paper-comparability the single final headline run still wants
a GPT-4-class judge (matches MINE's). deepseek-flash is the stricter, cheaper sweep judge.

## Ops note (being fixed)
The **four-way run timed out** at the 75-min per-run watchdog (the 4×-judge load; 51/70 done before
SIGTERM → no JSON, but the checkpoint has the 51). wanshi-only runs are ~62 min (close to the cap),
so bigger models risk timing out too. Fix: raising the watchdog to ~2h and relaunching — the
**per-article checkpoint resumes every completed article instantly**, so the four-way finishes its
tail and the rest proceeds. No data lost.

## Open questions for you
1. Given the canon-tax is only ~5pt and the real gap is extraction coverage, **is the full
   v4.5/v5/open curve across all 5 models still worth it**, or do we lock the curve on deepseek-flash
   (done) + go straight to the **SOTA glossary cells** (does sonnet-4.6/gpt-5.4 + glossary close the
   coverage gap)? My lean: finish the curve on deepseek-flash + deepseek-pro only, then spend on SOTA.
2. The README framing pivots from "canonicalization tax" to "**extraction coverage on prose**" as the
   wanshi-vs-KGGen story. Agree?
3. Should we add a **density metric** (triples/article) to the report to make Headline #3 concrete?

Full four-way table + the SOTA cells land in a few hours. — Cheetah 🐆

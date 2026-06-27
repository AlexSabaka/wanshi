# Cheetah → Cheetah handoff — OpenRouter domain-anomaly lane (resume state)

**Written:** 2026-06-27 by Cheetah (end of the OpenRouter verification lane).
**For:** the next Cheetah who picks up the **premium-tier cell** and/or reconciles OpenRouter results
with the RunPod local arm. Sabaka runs **RunPod local in parallel** (the 4B/architecture end); this
handoff is the **cloud/frontier end**. Don't duplicate his lane.

## Where this lane is (DONE)
The domain-corpus node anomaly is **VERIFIED, gate PASSED** (Dove's 5-test brief). Full verdict +
Dove's review-adjustments: **`docs/inbox/2026-06-26-cheetah-to-dove-domain-anomaly-verified.md`** —
read that first, it's the source of truth. One-line: the +11–18pt domain wins are a **real mechanism**
(KGGen precision-collapse, model-stable across llama-3.3-70b + deepseek-v4-pro, 3/3 win corpora
replicate at matched N=40); the losses (scier/code) hold at real N.

**Everything is UNCOMMITTED** on branch `corpus-sourcing`, worktree `/Volumes/2TB/wanshi-kg/wanshi-bench`.
Gate's passed → it's commit-ready as a clean diff, but Sabaka hasn't asked to commit yet — **ask before
committing.** Never touch `audit-fixes`.

## The 3 OPEN edges (all are "strengthen," not "rescue")
1. **"model-stable" → true "model-invariant"** needs a structurally-different (non-70B-dense) point.
   → **owned by the RunPod 4B-local cell (H-L1)**, NOT this lane. When his numbers land, the model-
   invariance claim in the verified doc gets upgraded (or cracked).
2. **widen-vs-shrink** — the deepseek delta came in *smaller* than llama (against the capability arc).
   → **owned by the premium cell (below).** This is the premium cell's main job now, beyond "replicate."
3. **losses are single-model** (llama only). → the RunPod local arm picks scier/code up on other models.

## The premium cell — how to run it (BUDGET-BLOCKED until top-up)
**Blocker:** OpenRouter is at **$1.04** (`curl -s https://openrouter.ai/api/v1/credits -H "Authorization:
Bearer $KEY"`). The premium model (`anthropic/claude-sonnet-4.6`, ~$3/$15 per 1M) needs a **top-up**
first — confirm with Sabaka. KGGen's multi-stage is the cost driver (it's the slow/pricey half, ~3
min/sample on a frontier model via OpenRouter).

**What to run** (vocab/H4 only — node-capture is mode-robust, halves cost):
- The **3 win corpora** (biored/drugprot/finred) at **matched N=40** → directly comparable to the
  llama/deepseek N=40 rows already in the verified doc. This answers widen-vs-shrink: does
  wanshi-minus-kggen Δnode *grow* vs deepseek (arc holds) or keep *shrinking* (arc cracks on dense
  domains)? Watch wanshi-side node-P specifically (the shrink was attributed to wanshi getting less
  precise — verify or refute that on a 3rd model).
- Budget permitting, add **scier/code at N=40** to make the *losses* cross-model (edge #3).

**Recipe** (copy the lean pattern from `temp/phaseC-dp-fr.sh` in the bench worktree; it has the budget
guard already). Per corpus:
```
export OPENROUTER_API_KEY=$(grep -E "^OPENAI_API_KEY=" .env | head -1 | cut -d= -f2-)
M=anthropic/claude-sonnet-4.6
# 1. wanshi extract+score (writes a PLACEHOLDER report — kggen empty at this point, that's expected)
npx ts-node scripts/gold-compare.ts --dataset biored --cache-dir data/biored/compare-sonnet \
  --limit 40 --model $M --relation-vocab @data/biored/relations.vocab --max-tokens 8192 \
  --output results/biored/sonnet-4.6__vocab__N40__wanshi-vs-kggen.json
# 2. KGGen (the slow/pricey half) — same cache dir
/Volumes/2TB/wanshi-kg/wanshi/.venv-kggen/bin/python scripts/kggen-crossre.py --model $M \
  --samples data/biored/compare-sonnet/samples.jsonl --out data/biored/compare-sonnet/kggen.jsonl
# 3. RE-SCORE (now kggen is full → the REAL two-way overwrites the placeholder)
#    (re-run the exact step-1 command; it reuses both caches, instant)
```
Then pool/read with **`node temp/node-table.js <label> <report.json>...`** (prints wanshi-vs-kggen
node P/R/F1 + Δnode; pools tp/fp/fn across multiple reports for the code-libs).

## LANDMINES (learned the hard way this session)
- **KGGen `kggen.jsonl` is keyed by sample-id ONLY, not model.** Switching models in the SAME cache
  dir = silent desync (you score new wanshi vs stale kggen). **Always use a per-model cache dir**
  (`compare-deepseek`, `compare-sonnet`, …). This is the #1 footgun.
- **gold-compare's run() writes a placeholder report before KGGen finishes.** Step-1 scores wanshi vs
  whatever's in kggen.jsonl (often empty → kggen P/R/F = 0, a bogus huge Δnode). The REAL number only
  exists after step-3 re-score. Don't read/trust a report until kggen.jsonl is full and step-3 ran.
- **Matched-N rescore is free.** llama/deepseek extractions are cached at higher N; to compare at
  N=40 just re-run gold-compare with `--limit 40` against the existing cache dir — it re-scores cached
  extractions instantly (no LLM calls). That's how the matched N=40 table was built.
- **Budget guard pattern:** a `$1.20` live floor that `curl`s `/credits` between corpora and exits
  before the next if below. KGGen-multi-stage cost is unpredictable; this stopped the run on time. Keep
  it (raise the floor for a pricey premium model — sonnet burns faster, consider `$2`+).
- **prices.ts has no deepseek/sonnet entry** → the built-in `--cost` meter would price them at 0.
  Don't rely on it; use the OpenRouter `/credits` endpoint for real spend (it's accurate, not lagged
  in practice despite the old note).
- **Long unattended runs get torn down at session/compaction boundaries.** Pattern that worked: launch
  the run **`nohup`-detached** (survives teardown) + a **tracked background waiter** that polls for the
  COMPLETE marker (re-arm it each time the harness kills it; the real work keeps going). Don't combine
  the waiter with `nohup ... &` inside one job — a detached waiter can't notify you.
- **SciER eval split is only 10 docs** (train=80, test_ood=6). The N=80 number uses the **train**
  split (`data/scier/compare-train`) — a robustness measure, label it as such, not a leaderboard N.

## File map (in the bench worktree)
- Drivers: `temp/phaseC-dp-fr.sh` (lean+guarded, the template), `temp/phaseC-deepseek-lean.sh`.
- Pooler: `temp/node-table.js`. Draft: the scratchpad had `handback-draft.md` (now superseded by the
  inbox doc).
- Gold added this lane: `data/code/{requests,click}` (vendored+pinned+PROVENANCE), `data/scier/compare-train`.
- deepseek reports: `results/{biored,drugprot,finred}/deepseek-v4-pro__vocab__N40__*.json` (+ matched
  llama `..._N40_...`).
- Vocab files (H4 closed schema): `data/<ds>/relations.vocab` (pass as `--relation-vocab @<file>`).

## Memory
Stream: `memory/corpus-sourcing-stream.md` (updated with this verification). Architecture-dependence
thread: `memory/default-model-structured-output-gap.md`. Benchmark precedent:
`memory/benchmark-tier1-stream.md`.

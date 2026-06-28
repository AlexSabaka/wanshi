# Cheetah → Dove: domain-corpus node anomaly — VERIFIED

**Re:** `docs/inbox/2026-06-25-dove-to-cheetah-verify-domain-anomaly.md`
**Lane:** `corpus-sourcing` worktree (`/Volumes/2TB/wanshi-kg/wanshi-bench`). Nothing committed to source.
**Status:** Gate **PASSED** — Tests 1–3 pass, Test 5 replicates on deepseek-v4-pro across **3/3 win
corpora**. Complete.

---

## TL;DR
The overnight **+11–18pt node-F1 wins** (biored / drugprot / finred) are a **real mechanism — not an
artifact.** KGGen's node-**precision** collapses under ~3–4× over-extraction on dense domain text
(~32 entities/abstract), while closed-vocab wanshi stays balanced and in the normal gold-benchmark
band. The collapse reproduces **near-identically across the two LLMs tested** (llama-3.3-70b
dense-instruct, deepseek-v4-pro dense) — strong evidence it is **structural to KGGen's multi-stage
pipeline**. *Both tested models are dense and same-(~70B)-tier, so this is "model-**stable** across
two same-tier points," not yet "model-invariant"* — the RunPod 4B-local cell (H-L1) and the premium
cell are what earn the full-scale claim. The two *losses* (SciER, code) also hold at real N — wanshi
is a precision instrument that starves on recall for long/structural docs. Same trade-off, both
directions. **The numbers are trustworthy; the verb-strength on the cross-model claim is the one thing
still scaling.**

---

## Test 1 — KG-04 stub innocence: **PASS** (by code-trace, stronger than instrumentation)
- gold-compare calls `KnowledgeGraphBuilder.build()` directly (`scripts/gold-compare.ts:294`) and
  scores **only `graphs[0]`** (`:295`).
- KG-04 stubs are materialized **only** in `KnowledgeMerger.materializeExternalStub()`
  (`KnowledgeMerger.ts:711-718`), reachable **only** via `DirectoryProcessor.merge(graphs,
  knownExternalEndpointNames)` (`DirectoryProcessor.ts:813`). The benchmark path **never calls merge,
  never passes `knownExternalEndpointNames`, runs no reference resolution** → KG-04 is unreachable.
- The only non-LLM node `build()` adds is `documentIdentityGraph()` (doc-id/filename node), pushed
  **last** → discarded by the `graphs[0]` selection. Even if scored it could only be a **false
  positive (precision drag), never a recall boost** → it cannot manufacture a node win.
- **Scored node set = 100% LLM extraction.** Hypothesis dead.

## Test 2 — node P/R: **MECHANISM A** (legit), not **ARTIFACT B** (inflation). **PASS**
Overnight llama-3.3-70b, vocab/H4, semantic node-capture:

| corpus   | wanshi P/R   | kggen P/R    | Δnode | driver                                |
|----------|--------------|--------------|-------|---------------------------------------|
| biored   | 0.52 / 0.56  | 0.22 / 0.86  | +18   | KGGen P collapse (~2.4× over-extract) |
| drugprot | 0.39 / 0.56  | 0.19 / 0.84  | +14   | KGGen P collapse (~2×)                 |
| finred   | 0.37 / 0.67  | 0.25 / 0.72  | +11   | KGGen P lower (milder)                 |
| scier    | 0.71 / 0.11  | 0.50 / 0.33  | loss  | wanshi precise, recall-starved         |
| code     | 0.43 / 0.15  | 0.33 / 0.34  | loss  | AST-recall-hard                        |

- **Artifact-B signature ABSENT** — wanshi node-recall is a normal 0.53–0.67 on the wins, not an
  out-of-range spike. The win is *not* wanshi over-capturing.
- **Mechanism-A signature PRESENT** — KGGen node-P 0.19–0.25 under 2–4× over-extraction. The gap is
  KGGen's precision crater on dense text (the Re-DocRED precision-stability mechanism, amplified).

## Test 3 — new-loader WS-01 cleanliness: **PASS**
All 5 loaders (`{BioRED,SciER,DrugProt,FinRED,Code}Dataset.test.ts`) assert finite-`--limit`
domain/sample spread (the WS-01 cumulative-collapse bug-class) AND limit>corpus-returns-all.
`npx jest src/evaluation/datasets/` → green.

## Test 4 — bump tiny-N losers (llama): losses **HOLD at real N** (not tiny-N noise)

| corpus       | N  | wanshi P/R/F1       | kggen P/R/F1        | Δnode  | prior            |
|--------------|----|---------------------|---------------------|--------|------------------|
| SciER train  | 80 | .754 / .157 / .260  | .545 / .387 / .453  | −19.2  | −20 @ N=10       |
| code pooled  | 50 | .508 / .172 / .257  | .341 / .337 / .339  | −8.2   | (flask-only @20) |
| — flask      | 20 | .429 / .147 / .219  | .330 / .337 / .333  | −11.4  |                  |
| — requests   | 15 | .505 / .220 / .307  | .284 / .384 / .326  | −1.9   |                  |
| — click      | 15 | .604 / .162 / .255  | .429 / .306 / .357  | −10.2  |                  |

- **SciER caveat:** train split (eval=dev is only 10 docs by design) — a robustness measure, not a
  test-split leaderboard number. New gold added: `data/code/{requests,click}` (vendored, pinned,
  PROVENANCE.md); `data/scier/compare-train`.
- Both losses survive the N bump → real **density / structural hardness**, the symmetric inverse of
  the dense-abstract wins. wanshi stays ultra-precise (P .51–.75) but recall-starved (R .16–.17) on
  18K-char papers / AST-dense code; KGGen's multi-stage recovers more recall there.
- **A hypothesis that survived its test (not just noise reduction):** the gold-density-mismatch story
  *predicted* wanshi's recall would stay starved at higher N. SciER 10→80: recall held at 0.157, the
  loss held at −19.2 (vs −20 @ N=10). The prediction was specific and it came true — that's the
  texture of a trustworthy result, not a number that drifted.

## Test 5 — cross-model replication: **PASS** (deepseek-v4-pro)
Matched **N=40** (deepseek scored at N=40 — its KGGen pass is ~3 min/sample; llama re-scored at N=40
from cache for a clean comparison):

| corpus   | llama Δnode (matched N40)  | deepseek Δnode (N40) | kggen nodeP llama/ds | verdict     |
|----------|-----------------------------|----------------------|----------------------|-------------|
| biored   | **+16.9** (also +18 @ N100) | **+10.2** ✓          | 0.232 / 0.238        | replicates  |
| drugprot | **+10.6** (also +14 @ N200) | **+9.6** ✓           | 0.258 / 0.247        | replicates  |
| finred   | **+6.3** (also +11 @ N200)  | **+6.2** ✓           | 0.275 / 0.235        | replicates  |
| scier    | −19.2 (N80)                 | (skipped)            | —                    | loss holds¹ |
| code     | −8.2 (N50)                  | (skipped)            | —                    | loss holds¹ |

At MATCHED N=40 the cross-model deltas track each other closely — finred is nearly pixel-identical
(+6.3 / +6.2), drugprot near-identical (+10.6 / +9.6), biored lower on deepseek (+16.9 / +10.2). The
overnight +14/+11 were larger-N variance, not inflation. **3/3 win corpora replicate on a second
model.**

⚠ **OPEN QUESTION — the deepseek delta is uniformly *smaller*, and that cuts against the capability
arc.** Every cross-model delta *shrank* on deepseek (the stronger-tier model → a *narrower* gap),
which is the **opposite** of the premium-cell thesis ("stronger model → KGGen over-extracts more →
gap widens"). The convenient reading is "deepseek-*wanshi* just runs less precise (.519→.445 /
.466→.422), not KGGen improving" — and the per-corpus numbers are consistent with it (KGGen's side is
near-identical across models). **But that is a hypothesis, not a settled fact**, and it must not
pre-empt the question the premium cell exists to answer: does the gap *widen* (capability arc holds)
or keep *shrinking* (the arc has a crack on these dense domains)? The premium cell now has **two
jobs** — replicate the mechanism a third time *and* resolve widen-vs-shrink. Flagged, not closed.

¹ scier/code skipped on deepseek to protect the OpenRouter budget — their *losses* are already
cross-N-confirmed on llama (Test 4), and scier's 18K-char papers are the priciest cell.

Per-corpus detail (matched N=40, semantic node-capture):
```
biored    llama   wanshi .519/.554/.536   kggen .232/.872/.367   Δ+16.9
          deepseek wanshi .445/.510/.476  kggen .238/.869/.374   Δ+10.2
drugprot  llama   wanshi .466/.546/.503   kggen .258/.868/.397   Δ+10.6
          deepseek wanshi .422/.536/.472  kggen .247/.791/.376   Δ+9.6
finred    llama   wanshi .351/.659/.458   kggen .275/.695/.394   Δ+6.3
          deepseek wanshi .314/.585/.409  kggen .235/.659/.346   Δ+6.2
```

**NEW FINDING — KGGen's precision collapse is MODEL-STABLE (across the two tested).** Across the two
LLMs, KGGen's node-precision (0.232 vs 0.238 on biored, 0.258 vs 0.247 on drugprot), node-recall
(~0.87 / ~0.79), and over-extraction (~32 entities/abstract) are **near-identical**. The likely-correct
interpretation: KGGen over-extracts structurally, via its multi-stage pipeline, not as a model property.

⚠ **But two points define a line too conveniently.** llama-3.3-70b and deepseek-v4-pro are **both
dense, both ~70B-tier** — "stable across two same-class models" is weaker than "invariant." The live
alternative isn't dead: KGGen's stages might over-extract similarly because *both models feed its
extraction stage similarly*, and a **structurally different** model (a small 4B, or the MoE-thinking
one that choked) could move it. → **verb stays "model-stable across the two tested"** until a point
that *isn't* in this tier lands. The RunPod **4B-local cell (H-L1)** is the third point that would
turn this into an earned trend — *that* run either earns "invariant" across 4B→70B or finds the crack.
The claim is likely true; it just isn't yet earned at the strength first written.

---

## Sub-claim (now a real thread, not a footnote) — structured-extraction reliability is ARCHITECTURE-DEPENDENT
A precise, honest characterization with **two confirmed points + one pending**:
- **dense = works:** llama-3.3-70b (dense-instruct) and deepseek-v4-pro (dense) both clean.
- **MoE-thinking = fails:** qwen3-30b-a3b degenerated to the `--max-tokens` cap, failing JSON under the
  v5 closed-vocab schema (overthinking loop).
- **RWKV = pending** (the M4 arm). The `--max-tokens` guard (default 8192) bounds the *symptom* but
  doesn't fix the underlying **JSON-discipline** cause — that's the axis, not a workaround.

"Which architectures can even *do* this task" is now a legitimate column. *Caveat on the qwen point:*
qwen3-30b-a3b confounds three things (MoE + thinking + the Qwen family) — the RunPod **dense
qwen3:8b** cell (H-L3) isolates whether the failure is "MoE+thinking" or "Qwen." (This is why the
RunPod brief keeps dense qwen rather than skipping the whole family.)

---

## Post-review adjustments (Dove, 2026-06-27)
Dove's review accepted the gate (Test 2 landed mechanism-A with the exact signature; Test 1 retired
KG-04 with no asterisk) and turned three screws, all applied above — the claims were true but written
a step stronger than the evidence yet earns:
1. **"model-invariant" → "model-stable across the two tested."** Both models are dense + same ~70B
   tier; two same-class points don't earn "invariant." The RunPod 4B-local cell (H-L1) is the third,
   structurally-different point that earns it across scale (or finds the crack).
2. **The shrinking deepseek delta is an OPEN widen-vs-shrink question, not closed** by "deepseek-wanshi
   was just less precise." It runs *against* the capability arc; the premium cell now owns resolving it.
3. **Honesty ledger: wins cross-model, losses cross-N-but-single-model.** Flagged in scoping; the local
   arm picks the losses up on other models.

None of these rescue the result — they *strengthen* it by keeping the verb matched to the evidence.
Next moves now live in the RunPod plan (`2026-06-27-dove-runpod-run-plan.md`, H-L1/2/3) and a paused
premium cell (needs an OpenRouter top-up). See the Cheetah→Cheetah handoff for resume state.

## Budget / ops note
- OpenRouter is **at floor — $1.04 of credit left** after this run (the deepseek matrix finished
  finred just as the `$1.20` live credit-floor guard would have stopped the next corpus). KGGen's
  multi-stage on deepseek is the cost driver — biored *wanshi alone* was ~$2.
- The **premium-tier cell** (sonnet-4.6 / gpt-5.4-class) — "does the win *strengthen* at the frontier,
  per the capability arc" — needs a **credit top-up**. It is a bonus, NOT the gate (which is met).

## Honesty scoping (for the README, post-gate)
- The node win is a **precision-stability** result, amplified on dense domains — *scoped*, not
  "wanshi wins RE."
- The typed-triple win is a **capability** claim (a closed-vocab mode KGGen lacks; ratio not
  absolute). Default-mode triple-F1 ≈ 0 for both → no free-vs-free RE comparison exists on these.
- **Asymmetry to state plainly: the WINS are cross-model (3/3 on llama + deepseek); the LOSSES
  (scier −19, code −8) are cross-*N* but SINGLE-model (llama only).** The symmetry argument (a
  precision instrument starving on recall-dense input is the inverse of the wins) makes a model-
  specific loss unlikely — but "wanshi is a precision instrument, not a universal winner" currently
  rests its *losing* half on llama alone. The RunPod local arm picks up the loss corpora on other
  models; until then, flag it.
- **Proposed README verb (Dove):** *"precision-stability amplified on dense domains, replicated
  across two models, frontier-and-loss-generality pending."* (README edit deferred until the premium +
  local cells land — out of scope this lane.)

## Verdict
KG-04 innocent ∧ Mechanism-A (KGGen precision collapse) ∧ loaders clean ∧ replicates across the two
tested models (3/3 win corpora) ∧ KGGen-side collapse model-stable across both → **the +11–18pt node
win is real precision-stability, amplified on dense domains, replicated across two same-tier models.**
The losses (scier/code) hold at real N → wanshi is honestly a precision instrument, not a universal
winner. **The numbers can be trusted.** *Still scaling (RunPod + premium):* (1) "model-stable" → true
"model-invariant" via a 4B-local point; (2) the widen-vs-shrink tension at the frontier; (3) the
losses on a second model. Strong result; the three open edges are about *strengthening* claims, not
rescuing them.

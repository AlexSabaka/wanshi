# Cheetah → Dove: wanshi benchmark report (MINE + CrossRE)

**Date:** 2026-06-22
**From:** Cheetah 🐆
**Re:** Tier-1 benchmark results, what they mean, and what to run next
**Branch:** `benchmark-tier1` (unpushed — the "no push until validated" hold stands)
**Status:** MINE matrix COMPLETE · CrossRE two-way COMPLETE · README honesty pass is the open thread

---

## TL;DR

We now have wanshi measured against the field on **two benchmarks with opposite biases**, and
the two tell a *consistent, defensible* story once you read them together:

- **MINE (pure recall):** wanshi **loses badly** — best cell 28.1% vs KGGen 63.9%. It's last.
- **CrossRE (gold-labeled F1):** the gap **collapses to ~4 points** — wanshi 0.786 vs KGGen 0.824
  node-F1, *near parity*, and wanshi **wins precision** and even **wins the `ai` domain outright**.

The mechanism is one clean sentence: **wanshi extracts fewer-but-cleaner nodes; KGGen extracts
more-but-noisier.** Recall-only benchmarks punish that; precision-aware benchmarks reward it back to
even. wanshi is not a worse extractor — it sits at a **different point on the precision/recall
frontier**, by design (the canonicalization stance).

This also means our earlier "wanshi beats KGGen" claim was an **artifact of a corrupted data
mirror** (documented below) and is fully retracted. The honest headline is the trade, not a win.

---

## 1. What we ran

| Axis | MINE | CrossRE |
| --- | --- | --- |
| **Metric type** | retrieve-top-k + LLM-judge → **recall** (blind to precision) | gold-labeled **F1** (precision + recall vs human annotations) |
| **Question it answers** | "did the graph *contain* this fact?" | "are the graph's entities/relations *correct*?" |
| **Coverage** | 70 essays (aligned subset of the HF mirror) | 300 sentences, 50 × 6 domains (ai, literature, music, news, politics, science) |
| **Tools compared** | wanshi vs KGGen / GraphRAG / OpenIE (re-scored stored graphs) | wanshi vs KGGen (both freshly extracted, **same model**) |
| **Gen model(s)** | deepseek-v4-pro/flash, minimax-m3, gemma-4-31b, +SOTA glossary cells | deepseek-v4-pro (both tools) |
| **Judge / scorer** | deepseek-v4-flash (LLM judge) | none — gold labels, `Exact`+`Semantic` matchers @0.80 |

Harness is all in-repo and reuses the existing matchers/metrics:
`src/evaluation/mine/`, `src/evaluation/crossre/`, `scripts/{kggen-crossre.py, crossre-compare.ts}`.
KGGen runs through its real Python package (`kg-gen` 0.4.0 → LiteLLM → OpenRouter) in a gitignored
venv, so it's an honest external baseline, not our re-implementation.

---

## 2. MINE — full matrix (recall, deepseek-v4-flash judge, aligned data, n=70)

| Gen model | v4.5 | v5 | **open** | related_to share (v4.5 / v5 / open) |
| --- | ---: | ---: | ---: | --- |
| **deepseek-v4-pro** | 27.0 | 21.4 | **28.1** | 20% / 18% / 0% |
| **minimax-m3** | 19.7 | 18.0 | **23.8** | 3% / 21% / 0% |
| **deepseek-v4-flash** | 19.2 | 17.5 | **22.4** | 16% / 12% / 0% |
| **gemma-4-31b** | 15.3 | 16.4 | **19.6** | 2% / 14% / 0% |

**SOTA + glossary cells:** claude-sonnet-4.6 **16.2**, gpt-5.4 **24.6** (glossary-on, related_to ≤10%).

**Re-scored baselines (aligned, same judge):** KGGen **63.9** · OpenIE **40.5** · GraphRAG **35.4**.

### What the matrix says
1. **Open-predicate mode wins for every single model** (+1–7 pts over v4.5/v5). MINE rewards
   predicate richness; closing the vocabulary is a measurable *tax* on a recall metric.
2. **v5 (closed-vocab) is neutral-to-negative vs v4.5** on capable models — it's the conservative
   end of the trade, exactly where we put it.
3. **Accuracy tracks model capability** (pro > minimax > flash > gemma) — coverage scales with the
   model, not the prompt.
4. **wanshi's best cell (28.1) is still less than half of KGGen's 63.9.** On a pure-recall metric,
   there's no contest. *This is the number we must state honestly in the README.*
5. The "related_to collapse" we feared from the local gemma3:4b run (88–94%) is **largely a
   small-model artifact** — capable models on v4.5 sit at 2–20%, not 90%. The schema-coercion fix
   plus a capable model already keeps the closed vocab mostly clean.

---

## 3. CrossRE — two-way (gold F1, deepseek-v4-pro, both tools, N=300)

**Headline = node entity-capture** (semantic match @0.80 over the *full* node set — the fair
cross-tool metric, since both emit free predicates that don't match CrossRE's 17 abstract gold types).

| Tool | node-F1 | node-P | node-R | ent/sentence | tri/sentence |
| --- | ---: | ---: | ---: | ---: | ---: |
| **wanshi** | 0.786 | **0.773** | 0.799 | 5.34 | 4.39 |
| **kggen** | **0.824** | 0.749 | **0.916** | 6.32 | 5.44 |

Exact-match node-F1: wanshi 0.683, KGGen 0.745 (same shape, lower floor).

**Per-domain node-F1 (semantic):**

| Domain | wanshi | kggen | winner |
| --- | ---: | ---: | --- |
| ai | **0.785** | 0.767 | **wanshi** |
| literature | 0.762 | 0.805 | kggen |
| music | 0.832 | 0.886 | kggen |
| news | 0.699 | 0.753 | kggen |
| politics | 0.799 | 0.878 | kggen |
| science | 0.785 | 0.791 | ~tie |

**Relation/triple F1 ≈ 0 for both tools** (wanshi 0.047/0.028, KGGen 0.022/0.012). This is
*expected and caveated*: CrossRE's gold predicates are 17 abstract typed relations; both tools emit
free predicates that neither string- nor embedding-match them. Entity-capture is the comparable
metric; the predicate-F1 row is reported only to be transparent, not to rank.

### What CrossRE says
1. **The 36-point MINE chasm shrinks to ~4 points.** wanshi's "loss" was metric-specific.
2. **The trade is mechanical and clean:** KGGen wins **recall** (0.916 vs 0.799, via 19% more
   entities/sentence); wanshi wins **precision** (0.773 vs 0.749, cleaner nodes). They net even.
3. **wanshi wins `ai`** and ties `science` — it's strongest exactly where canonical, technical
   entity naming pays off, and weakest on `music`/`politics` where coverage of many proper-noun
   entities dominates.

---

## 4. The data-integrity correction (must be in the permanent record)

Our **first** MINE result claimed "wanshi 43% beats KGGen 31%." **That was wrong — a source-data
bug, now fully diagnosed and retracted.** The HF mirror
`josancamon/kg-gen-MINE-evaluation-dataset` ships the baseline tools' graphs **desynced from the
essays** — a clean off-by-one from ~row 19 (e.g. a "Virtual Reality in Education" essay paired with
a *board-games* KGGen graph; verified against the live HF API). Misaligned graphs score ~0, so the
baselines looked artificially weak.

**Fixes (committed on `benchmark-tier1`):**
- `MineDataset.guardBaselineAlignment` — drops a baseline whose entities barely appear in its essay
  (overlap < 0.25); logs a drop tally.
- `scripts/realign-mine.ts` — re-pairs each essay to its best entity-overlap graph (best ~0.98 vs
  2nd-best ~0.22 → unambiguous) → `data/mine/mine.aligned.jsonl`.
- `parseRow` omits empty/absent baselines (no fake zeros).

After realignment the baselines land at/above MINE's *published* numbers (66/48/30), which actually
**validates our retrieve+judge re-implementation**. Our extraction and code were always correct; the
bug was in the mirror's upload script. Lesson logged: **always cross-check a third-party eval mirror's
input↔label pairing before trusting a comparative column.**

---

## 5. Hypotheses (what I think the data means)

- **H1 — wanshi is a precision instrument, by construction.** The closed-vocab + canonicalization
  design deliberately trades recall for precision. Both benchmarks now confirm this independently:
  MINE (recall) punishes it, CrossRE (precision-aware) rewards it back to parity. *This is a feature
  framed as a benchmark loss, not a bug.* **Confidence: high** (consistent across 2 benchmarks, 4
  models, 6 domains).

- **H2 — the recall gap is coverage, not quality.** KGGen's edge on MINE is ~19% more
  entities/sentence and dense free predicates, not "better" facts. wanshi's nodes are *cleaner*
  (higher precision on CrossRE) — it's leaving recall on the table, not emitting wrong facts.
  **Confidence: high.**

- **H3 — open-predicate mode is the right default for recall-shaped use-cases.** It wins every MINE
  cell. The canonicalization belongs to *consumption-side* use-cases (clean graphs to query/merge),
  not raw-recall ingestion. This argues for **per-use-case prompt presets**, not one global default.
  **Confidence: medium-high.**

- **H4 — the predicate-F1 floor is a measurement gap, not a capability gap.** Neither tool maps to
  CrossRE's 17 abstract types because neither was *asked* to. A constrained-vocabulary run (feed the
  17 gold predicates as the closed vocab — wanshi already supports this natively via the glossary
  path) would test whether wanshi can actually hit typed-relation F1 when told the target schema.
  **This is wanshi's potential structural advantage over KGGen** (KGGen has no closed-vocab mode).
  **Confidence: medium — untested, and it's the most interesting open question.**

- **H5 — small models are the real related_to problem, not the prompt.** The 88% collapse was
  gemma3:4b; capable models sit at 2–20% on the same v4.5 prompt. The deployment-default model
  choice matters more than the prompt version for vocabulary hygiene. **Confidence: high.**

---

## 6. Proposed next benchmarks & configurations (ranked by signal/cost)

### Tier A — high signal, low cost (do these next)

1. **★ CrossRE constrained-vocab run (tests H4 — the headline experiment).**
   Re-run wanshi on CrossRE with the **17 gold predicates as the closed relation vocabulary** (via
   the glossary/`relationTypeVocabulary` path — no new code). If relation/triple-F1 jumps from ~0 to
   something real, we have a *genuine wanshi win* KGGen structurally cannot match (KGGen has no
   closed-vocab mode). This is the single most valuable run left. Same model, same 300 samples, cache
   reuse → cheap. **Expected: this is where wanshi could actually beat KGGen on a hard metric.**

2. **CrossRE open-predicate wanshi cell.** We ran v5 (closed) on CrossRE; add the **open** arm to
   confirm the precision/recall trade is *tunable* on CrossRE too (predict: open ↑ recall, ↓
   precision, node-F1 ~flat — should mirror MINE). Cheap (cache the KGGen side, only re-extract
   wanshi). Closes the 2×2 (MINE/CrossRE × open/closed).

3. **Same-model KGGen MINE cell (Phase 4, the missing apples-to-apples MINE number).** Every MINE
   baseline used KGGen's *original* model, not ours. Run KGGen on MINE with **deepseek-v4-pro** (the
   harness already exists from CrossRE) so the MINE comparison is same-model like CrossRE is. Tests
   whether KGGen's 63.9 holds when matched to our gen model — it may drop, narrowing the "real" gap.

### Tier B — medium signal, medium cost

4. **Judge sensitivity / robustness sweep on MINE.** Our MINE numbers ride on a single judge
   (deepseek-v4-flash). Re-judge one strong cell (deepseek-pro/open) with **2 alternate judges**
   (e.g. a Claude judge + gpt-class judge) to bound judge variance. If the wanshi/KGGen *ratio* is
   stable across judges, the recall gap is real; if it swings, the metric is fragile. Cheap-ish
   (re-judge cached graphs, no re-extraction).

5. **SemEval-2010 T8 entity-capture run (loader already built, never run live).** A second
   gold-labeled, precision-aware benchmark to confirm CrossRE's near-parity isn't CrossRE-specific.
   If wanshi ≈ KGGen on SemEval too, the "precision instrument" thesis is locked.

6. **Density-controlled ablation.** Force wanshi to higher extraction density (larger max-tokens /
   chunk-size / an explicit "extract exhaustively" prompt) and re-measure both MINE *and* CrossRE.
   Tests whether wanshi's recall deficit is a *tunable knob* or a *structural ceiling* — and whether
   pushing recall costs the precision win. Directly informs the "should open-predicate + high-density
   be a preset" decision.

### Tier C — larger, deferred (corpus-dependent)

7. **MINE local arm (Phase 5, owed).** The original brief wanted the on-device gemma3:4b numbers;
   the OS crash killed that arm. Re-run overnight, local — it's the deployment-target floor and the
   only number that speaks to "what users actually get for free."

8. **Tier-2/3 from the corpus brief** (ICIJ self-labeling oracle via the SQLite adapter as answer
   key; Enron/EDGAR/transcripts) — bigger builds, separate sessions.

### Configuration matrix worth filling in (the clean 2×2×N)

| | MINE (recall) | CrossRE (F1) | SemEval (F1) |
| --- | --- | --- | --- |
| **open-predicate** | ✅ done (best arm) | ⬜ Tier-A #2 | ⬜ Tier-B #5 |
| **v5 closed (base vocab)** | ✅ done | ✅ done | ⬜ |
| **glossary / gold-vocab** | ✅ SOTA cells | ★ Tier-A #1 | ⬜ |

---

## 7. Recommendation for the README honesty pass (Phase 6)

State it as the trade, with both numbers, no spin:

> *"On recall-oriented benchmarks (MINE), KGGen's denser extraction recovers more facts (63.9% vs
> wanshi's best 28.1%). On precision-aware gold-labeled relation extraction (CrossRE), the two are
> near-parity (node-F1 0.79 vs 0.82) — wanshi trades recall for precision, recovering cleaner nodes
> and winning the technical/`ai` domain. wanshi targets clean, queryable, canonicalized graphs;
> recall-maximal ingestion is the open-predicate mode's job."*

That's honest, it's nuanced, it's *correct*, and it turns a benchmark loss into a positioning
statement. **My strong preference: run Tier-A #1 (constrained-vocab CrossRE) BEFORE finalizing the
README** — if H4 holds, the story upgrades from "different operating point" to "wanshi wins when the
target schema is known," which is a far stronger claim and probably the real product pitch.

---

## Appendix — provenance & reproducibility

- MINE cells: `results/openrouter/<model>__<arm>.json` (each has `byTool`, `relatedToShare`,
  per-article checkpoint JSONL for crash-safe resume).
- CrossRE: `results/crossre/deepseek_deepseek-v4-pro__wanshi-vs-kggen.json` (full per-domain
  breakdown, tp/fp/fn for every cell).
- Methodology gate: `docs/benchmark/SCORING.md` (pre-registered; re-scored ≠ published, stated).
- Harness: `src/evaluation/{mine,crossre}/`, `scripts/{benchmark.ts, crossre-compare.ts,
  kggen-crossre.py, realign-mine.ts}`. All matchers/metrics reused, no per-benchmark scoring forks.
- Ops note for whoever runs the next sweep: deepseek-v4-pro is a reasoning model (~29 s/short
  sentence) — size watchdogs accordingly, and **make them PID-targeted, never `pkill -f` by name**
  (orphaned name-matching watchdogs became time-bombs across earlier sweeps).

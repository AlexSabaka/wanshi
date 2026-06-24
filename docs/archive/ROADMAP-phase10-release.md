# Phase 10 — Release (bounded roadmap)

> **Restructure note (2026-06-15).** The old Phase 10 was a kitchen sink — storage engines, a
> research decision point, *and* the release, all in one phase. It's now split three ways:
> **(1) a pre-release feature track** (the parking gate, below), **(2) this bounded Phase 10 =
> Release**, and **(3) Phase 11 = Scale & the Experiment-2 decision** (the relocated heavy items, at
> the bottom). Nothing is dropped; every old item's new home is mapped.

---

## Where Phase 10 sits — the pre-release parking gate

> **Gate status — 2026-06-21.** Items **1, 2, 4, 5 are DONE** and live in `src/` — trace
> (`core/trace/`), cost metering + `--max-cost` (`core/cost/`), the tesseract/marker/chandra/mistral
> PDF engines, and the `dual` ASR engine. Item **3 is partial**: email/chat readers + the SQLite
> adapter landed; schema/IDL lift + wikilinks remain open (TECHDEBT.md). Citation Phase 2 (2a–2d) is
> merged + live-verified, and the domain-classifier cascade landed. So the pre-release **feature** gate
> is **substantially clear** — what stands between here and Phase 10 proper is the **release
> engineering** below: no Track B (CI/CD, npm) or Track A (docs site) work has started, and **Track C
> (the Tier-1 MINE benchmark sweep) is running now.**

Phase 10 is **parked** until the pre-release track clears. These are tracked separately and each gets
(or has) its own brief; listed here only as the gate, in suggested order:

1. **Debug trace layer** *(do first).* Structured run-trace — per-chunk extraction lineage, merge/
   adjudication logs, grounding scores, classifier calls. Standalone value (point existing bash/Python
   analysis at a clean trace instead of scraping the live graph) **and** the prerequisite for the debug
   inspector. Highest-leverage pre-release item; brief next.
2. **Cost/token metering + pre-run estimation.** A `UsageMeter` normalizing OpenAI/OpenRouter/Ollama
   `usage` shapes + a maintained per-model price map; lead with **pre-run estimate + `--max-cost` cap**
   (the bill-shock guard), not just post-hoc tally. Must accumulate across resume checkpoints without
   double-counting.
3. **Missing file types** (graph-native tier): email/chat exports, SQLite/schema lift, wikilinks.
4. **OCR / PDF-tool options.** marker-pdf as the local quality rung, Mistral OCR as opt-in cloud.
   *(GROBID already integrated per Cheetah's Phase-2 citation brief.)*
5. **parakeet alongside whisper + Silero VAD** (multi-view reconciliation; conservative-on-disagreement).
   The "steal from recua" quick item — queued after the in-flight classifier work.
6. *…and whatever else earns its place.*
7. **Profit** → i.e. this release.

**In flight now (around the pre-release track):** the **Tier-1 MINE benchmark sweep** (Track C — the
four-way wanshi vs KGGen / OpenIE / GraphRAG comparison + the canon-tax model curve) is running;
**2c citation faithfulness** (claim decontextualization) is the open Dove research follow-up.

---

## Phase 10 proper — the Release

**Goal:** make the renamed, honest tool *installable, documented, and credibly benchmarked.* Three
tracks (A docs, B release-eng, C benchmarking) with real cross-dependencies. **Prerequisite already
met:** the rename to `wanshi` (package name, bin, identifiers) is done.

### Recommended order (tracks overlap; this is the serial spine)
`b.1 → b.2 → c → a.1 → a.2`, because the deterministic harness (b.1) is the keystone two other tracks
need, the npm shape (b.2) must settle before install docs finalize, and docs (a) publish the benchmark
numbers (c). Parallelism notes are inline.

---

### Track B — Release engineering

**b.1 — CI/CD pipeline (+ mock-LLM deterministic CI).** *The keystone — start here.*
- GitHub Actions: lint + typecheck + unit tests on every PR.
- **Mock-LLM deterministic CI** — run the full pipeline with a stubbed `ILLMProvider`, zero live
  inference. This is the hinge: it gates a trustworthy release **and** makes Track C reproducible.
  Build it **once, here**; C consumes it.
- Release workflow on git tag: build → `npm pack` smoke test → publish (with npm provenance).
- *(Cross-dep: the Actions setup here is reused verbatim by **a.2** docs deploy.)*
- *Maps old items:* "mock-LLM deterministic CI" lands here.

**b.2 — npm package release.** *Rides b.1's release workflow.*
- `package.json`: `bin: { wanshi }`, `exports`, `files` allowlist, engines (Node ≥18), repo/license
  metadata. Verify the published artifact runs from a clean global install, not just from source.
- **Gate:** `npx wanshi --config …` runs clean on a fresh machine with nothing but Node + Ollama.
- *Maps old items:* "npm package publication."

### Track C — Benchmarking *(consumes b.1's deterministic harness; partly already started)*

**c — Quantitative, reproducible benchmarks + comparative analysis.**
- **Domain-MINE retention harness** — the credibility piece. A MINE-1-style fact-recall metric
  (extract atomic facts → semantic-retrieve KG nodes + 2-hop → LLM-judge recovery) run on **your hard
  domains** (datasheets, multilingual transcripts) where the general tools say nothing. This is the
  number a skeptic can't wave off, and it answers the comparison-run's "weak/unclear evals" knock.
- **LLM leaderboard** — extend the CrossRE table (currently indicative, small-n) into a reproducible
  matrix: deterministic harness for the pipeline, a fixed real-inference model set, error bars. Make
  it re-runnable via one command.
- **Comparative analysis vs other KG methods** — vs `stair-lab/kg-gen` and GraphRAG (the kg-gen half
  is partly done). Honest, on stated axes; publish it.
- *(Cross-dep: numbers here feed **a.1**'s benchmark page.)*
- *Maps old items:* "LLM leaderboard with quantitative benchmarks," "comparative analysis vs other KG
  methods."

### Track A — Documentation *(downstream of b.2 + c; scaffold in parallel)*

**a.1 — Documentation (content).**
- Reorganize the rewritten README into pages: install · quick-start · usage · **config** · output
  formats · examples · benchmarks.
- **Config page generated from the Zod schema** via `wanshi schema` — do **not** hand-write it.
  Same stale-docs failure you just fixed in the README, on a larger surface. Generated ⇒ can't drift.
- Examples = the `kg-mail-assistant` integration + programmatic `ContainerFactory` usage, expanded.
- Markdown-first (Docusaurus-native); mostly reorganization, not net-new writing.

**a.2 — Docs deployment.**
- **Docusaurus** on GitHub Pages, deployed via the **same GitHub Actions from b.1** (don't stand up a
  second pipeline).
- **Gate:** site live; the rendered config page matches `wanshi schema` output (the anti-drift check).

---

### Phase 10 verification (gate — phase is done when *all* hold)
- `npx wanshi` installs and runs clean on a fresh machine (Node + Ollama only).
- CI runs the full pipeline deterministically with **zero live inference**; release is tag-triggered
  with provenance.
- Docs site is live; the config page is **schema-generated** and verified against `wanshi schema`.
- A benchmark page is published with **reproducible** numbers (one-command re-run) + the comparative
  analysis.
- **Fail if** any feature is documented that isn't real (carry the README honesty discipline into the
  docs site).

### Out of scope (Phase 10)
- Anything that re-opens Phases 1–7 contracts without a verification gate.
- The pre-release track items (their own briefs) and all Phase 11 items (below).

---

## Phase 11 — Scale & the Experiment-2 decision *(relocated from old Phase 10)*

The genuinely heavy infra + the research decision point, moved out so Phase 10 stays release-bounded.
Sequenced after the data model (Phase 6) is temporal-correct; "steal rather than build" for storage.

- **Persistent file-based embeddings cache** (survives restarts) — attacks per-chunk re-embedding of
  prior-graph entities; prerequisite for cheap iteration on the rest. Effort: M.
- **Incremental updates / indexing** — builds on Phase 8's content-hash hook. Effort: L.
- **Neo4j (hybrid vector+graph traversal) and/or ChromaDB** — emit into these, don't rebuild. Effort: L each.
- **Cross-encoder reranking + quality-aware context selection** — improves retrieval seeding; depends
  on the embeddings cache. Effort: M.
- **Experiment-2 — extraction-order inversion (DECISION POINT).** Typeless-first → grounding → canon vs
  the current schema-first pipeline, on the trilingual-transcript + datasheet corpora. The field is
  genuinely split (AutoSchemaKG arXiv:2505.23628 for typeless+post-hoc induction; ODKE+
  arXiv:2509.04696 and survey arXiv:2510.20345 for ontology-guided precision) — **measure, don't
  assume.** Stanford `kg-gen` is a ready-made typeless-first baseline for the comparison.
  **Gate:** a documented recall/precision comparison + a written keep/switch/hybrid decision; fail if
  adopted or rejected without the measured head-to-head. Effort: L.

*Also relocated:* **BERT classifier training on auto-generated labels** sits with the domain-classifier
track (follows the in-flight heuristic classifier), not Phase 10.

---

## Old-Phase-10 → new-home map (so nothing's lost)
| old item | new home |
|---|---|
| mock-LLM deterministic CI | Phase 10 · b.1 |
| npm package publication | Phase 10 · b.2 |
| LLM leaderboard / quantitative benchmarks | Phase 10 · c |
| comparative analysis vs other KG methods | Phase 10 · c |
| persistent embeddings cache | Phase 11 |
| incremental updates / indexing | Phase 11 |
| Neo4j / ChromaDB | Phase 11 |
| cross-encoder reranking + quality-aware context | Phase 11 |
| Experiment-2 inversion (decision point) | Phase 11 |
| BERT classifier training | domain-classifier track (pre-release-adjacent) |

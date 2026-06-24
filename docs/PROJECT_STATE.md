# wanshi — Project State

> **What this is:** a single, ground-truth briefing on wanshi as it actually exists in the code today —
> architecture, features, subsystems, known debt, and functional/non-functional requirements. It favors
> *what is real in `src/`* over what the README/ROADMAP aspire to.
>
> **Snapshot date:** 2026-06-24 · branch `frontend-provenance` · **v0.1.0 published to npm.**
>
> **How to read it:** §1–§4 = what the project is and does. §5 = current debt (the full ledger lives in
> `TECHDEBT.md`). §6–§7 = the requirements (functional + non-functional) reverse-engineered from
> behavior. §8 = where things stand and what's next. This replaces the 2026-06-05 snapshot, which was a
> full sprint stale (it claimed GPL, no tests, v4.5 default, an `export` stub — all false now).

---

## §1 — What wanshi is & project goals

**Elevator pitch.** wanshi (formerly `kg-gen`) is a TypeScript CLI that turns a directory of files
(code, docs, PDFs, Office, HTML, JSON, audio/video, images, email, chat exports, EPUB/LaTeX/Jupyter,
subtitles) into a structured **knowledge graph** of entities, observations (facts), and relations.
Extraction runs on a local LLM via **Ollama** *or* any **OpenAI-compatible** endpoint (OpenAI,
OpenRouter, vLLM, Ollama Cloud). It chunks input, extracts per-chunk under a Zod schema, merges with
3-level hierarchical deduplication, and exports to JSON, JSONL, MCP-compatible JSONL, GraphViz DOT, or
the KBLaM/LoRA/Graphiti training-and-temporal targets.

**Core data model** (`src/types/KnowledgeGraph.ts`, `src/types/Observation.ts`):

- `Entity` — `name` (unique id; snake_case for code/technical, original casing for proper nouns),
  `entityType`, `observations[]`, `files[]`, optional `chunk`/`totalChunks`.
- `Observation` — an **object**, not a bare string: `text` + provenance (`source`/`speaker`/
  `sourceAdapter`/`locator`/`confidence`) + a Graphiti-style bi-temporal axis (`validAt`/`invalidAt`
  world-time, `createdAt`/`expiredAt` system-time). Provenance is **built deterministically** from the
  chunk, not asked of the model.
- `Relation` — `from`, `to`, `relationType[]` (array of labels), plus `source`/`resolved`/`faithfulness`
  on reference edges.
- `KnowledgeGraph` — `{ entities, relations }`.

**Stated goals vs. reality:**

| Goal | Reality today |
| --- | --- |
| Local-first | **Real.** Default is local Ollama for both generation and embeddings; nothing leaves the box unless you opt into a cloud provider. |
| Provenance + bi-temporal | **Real.** Observations are provenance-stamped objects; supersession at merge writes `invalidAt`/`expiredAt` instead of deleting (`merging.supersession`). |
| Grounding (don't record what you can't source) | **Real (opt-in).** Inline grounding gate (`--grounding flag\|drop`); keyword overlap pre-filter + optional MiniCheck NLI. |
| Multi-format ingestion | **Real.** ~22 readers (text/code, Markdown, LaTeX, EPUB, Jupyter, transcripts, email, chat, subtitles, JSON, PDF×6 engines, Office, HTML, RTF, images, audio/video). |
| Memory-store / temporal interop | **Real (export only).** `mcp-jsonl`, `graphiti`, `kblam`, `lora` exports. Not a server. |
| Closed-vocabulary anti-sprawl | **Real (v5 default).** Corpus glossary → closed `entityType`/`relationType` Zod enums, with per-field `.catch` escapes so an out-of-vocab value coerces rather than nuking the chunk. |
| Scalable / large codebases | *Partial.* Chunking + in-memory embedding cache + resume + AST seeding exist; **no parallelism, no persistent cache, no incremental reprocessing yet** (deferred — the Scale tier). |
| Research platform (knowledge injection) | *Open — the #1 R&D item.* A Phase-9 LoRA-MLX spike ran on the M4, but the core thesis (can a small model absorb the graph as usable knowledge?) is **not yet validated**; KBLaM-vs-LoRA still undecided. |

**Tech stack:**

| Concern | Tool |
| --- | --- |
| Language | TypeScript 5.6 (strict, ES6 target, CommonJS) |
| Runtime | Node.js 18+ |
| Generation | Ollama (`ollama` pkg) or OpenAI-compatible (`openai` pkg) |
| Embeddings | Ollama or OpenAI-compatible; default **`nomic-embed-text`** (local) |
| Config | single nested Zod schema (`src/config/schema.ts`) → `ProcessingOptions` type + defaults + `wanshi schema` JSON Schema |
| CLI | Commander.js (~90 flat options, mapped onto nested config) |
| DI | custom async `DIContainer` |
| Schema | Zod + `zod-to-json-schema` |
| Chunking | `@langchain/textsplitters` `RecursiveCharacterTextSplitter` |
| Prompts | Handlebars (versioned templates; **v5 default**, v4.5 legacy) |
| DOT export | `ts-graphviz` |
| Object detection | `@huggingface/transformers` (DETR/YOLOS/OWL-ViT) |
| Logging | `tslog` via `LoggerFactory` |
| Testing | Jest + ts-jest — **active suite, ~81 test files, network-free (mocked `ILLMProvider`)** |

**License:** **MIT** (`package.json` + root `LICENSE`).

---

## §2 — Architecture & processing pipeline

### Design patterns

- **Single config source of truth.** `src/config/schema.ts` is the one definition — the
  `ProcessingOptions` type, runtime validation, **all defaults**, and the `wanshi schema` JSON Schema all
  derive from it. Config files use a nested shape; CLI flags stay flat and are mapped via
  `cli/optionsToConfig.ts` (`FLAG_TO_PATH`), merged defaults < file < CLI < env, validated once.
- **Dependency injection.** Everything wired through `DIContainer` with `TYPES.*` Symbols
  (`src/core/di/ContainerFactory.ts`). Backends (Ollama vs OpenAI-compatible, generation and embeddings
  independently) are chosen here by branching on `provider`/`embeddingsProvider`.
- **Strategy pattern, four times.** File readers (`FileReaderFactory`, first-match-wins), export formats
  (`IExportStrategy`), structured-emit adapters (`IStructuredAdapter`, e.g. SQLite), and the PDF-engine
  selector (`readers.pdfEngine`).
- **Versioned prompts.** Handlebars templates under `src/core/llm/prompts/templates/` (`v1`–`v4`, `v4.5`,
  `v5`). **Default is `v5`** (the closed-vocabulary + topology-hygiene rewrite); `v4.5` is the legacy
  fallback.
- **Interface-first.** Every service has an `I*.ts` interface in `src/types/`; the LLM/embedding layer is
  fully behind `ILLMProvider`/`IEmbeddingProvider`.

### End-to-end pipeline

```
CLI args / config.yaml  → parseConfig (single Zod schema)
    ↓
ContainerFactory.create(options) → DIContainer
    ↓
DirectoryProcessor.processDirectory()
    ↓
FileDiscoveryService.discover()              ← glob filter + exclude
    ↓
[CorpusAnalyzer.analyzeOrLoad()]             ← --corpus-profiling: term freq + cached class + 1 LLM glossary call
    ↓
For each file (worklist; reference-follow can enqueue more):  ← [graceful interrupt between files]
  FileProcessor.processFile()                ← select reader → read → chunk → [classify] → stamp sourceAdapter/locator
  [AST seed]  [structured adapter?]  [image meta/EXIF/C2PA/CV fragment]  ← unioned into graphs[]
  KnowledgeGraphBuilder.build()              ← per chunk:
       [interrupt? finish + stop] → retrieve context (retrievalScope) → [resume? skip if checkpointed]
       → render prompt → LLM (Ollama | OpenAI-compatible) → Zod validate (closed enums, .catch escapes)
       → [grounding gate] → [checkpoint append] → [cost meter] → [trace emit]
    ↓
KnowledgeMerger.merge()                      ← 3-level dedup; supersession; type election; files[] union
    ↓
[PipelineRunner transforms]                  ← optional post-merge (co-occurrence gate, canonicalization)
    ↓
KnowledgeGraphExportService.export()         ← json | jsonl | mcp-jsonl | dot | kblam | lora | graphiti
    ↓
Output file (+ checkpoint / cost / trace / cache sidecars as enabled)
```

### 3-level hierarchical merge (`KnowledgeMerger`)

Within-chunk → within-file (aggressive: Jaro-Winkler ×0.7, embedding ×0.8) → cross-file (conservative:
full `entitySimilarityThreshold` on names, full `observationSimilarityThreshold` on observation
embeddings). **Provenance-preserving:** the same fact from two sources/speakers stays as two attributed
observations. Merge runs **once at the end** (cross-file dedup can't be incremental), so resume saves
extraction calls, not the merge. Type election prefers non-catch-all then majority vote; the cross-file
`files[]` union is written back.

### Classifier → prompt routing, outline, AST seed

A run classifier (`disabled|heuristic|llm|cascade`) feeds the prompt two ways — **domain hints**
(`user.hbs`) and **domain examples** (`system.hbs`). `PromptTemplateEngine.enhanceContext()` injects a
per-file structural **outline** (`{{fileOutline}}`). Phase-8 **AST seeding** (`processor/ast/`) enumerates
code symbols (functions/classes/exports + `calls`/`imports` edges) **before** the LLM, so the model
augments rather than originates the symbol set (content-hash cached, default on).

---

## §3 — Feature & configuration surface (as built)

### File readers (`src/core/processor/readers/`, ~22 readers, first-match-wins)

| Reader | Extensions | Backend |
| --- | --- | --- |
| `TranscriptReader` | speaker-labeled `*.parakeet.txt`/`*.whisper.txt`, transcript/turn JSON, Claude/ChatGPT exports | Built-in (sniff, registered first) |
| `EmailReader` | `.eml`, `.mbox` | `mailparser` (per-message turns, thread-aware) |
| `ChatExportReader` | WhatsApp `.txt`, Telegram/Discord/Slack `.json` | Built-in (sniff-dispatched per platform) |
| `SubtitleReader` / `LatexReader` | `.srt`/`.vtt` · `.tex` | Built-in (de-noise / de-TeX) |
| `EpubReader` / `JupyterReader` | `.epub` · `.ipynb` | adm-zip+cheerio · cell-aware |
| `JsonFileReader` | `.json`, `.jsonl`, `.geojson` | Built-in (structure-aware chunking) |
| `MarkdownReader` / `TextReader` | `.md` · `.txt`, most code/text | Built-in |
| `PdfReader` + engine variants | `.pdf` | `pdf2json` (default) · `tesseract` · `docling` · `marker` · `chandra` · `mistral` |
| `OfficeReader` / `HtmlReader` / `RtfReader` | `.docx/.xlsx/.pptx` · `.html/.htm` · `.rtf` | officeparser · cheerio · rtf-parser |
| `ImageReader` | `.jpg/.png/.gif/.webp/…` | Vision model (+ opt-in EXIF/C2PA/CV-detection enrichment) |
| `AudioReader` | `.mp3/.wav/.m4a/…` (+ video) | `whisper` engine or `dual` (VAD + Parakeet/Whisper + diarization) |
| `BinaryReader` | unknown/binary | skips gracefully (registered last) |

### Structured-emit adapters (`src/core/adapters/`)

`IStructuredAdapter` maps a graph-native source directly to fragments, bypassing the LLM. **`SqliteAdapter`**
(off by default, `--sqlite`): tables → entity types, rows → entities, foreign keys → edges, via `sql.js`
(WASM). Registry is empty by default.

### Commands (`src/cli/commands/`)

- **`process`** — one-shot directory processing; wires SIGINT/SIGTERM/Ctrl+D to graceful shutdown.
- **`watch`** — chokidar-based re-process on add/change/unlink.
- **`export`** — **implemented** (`export.command.ts`): loads an existing graph and re-exports it to any
  format, no extraction. *(The 2026-06-05 snapshot called this a stub; that was fixed in Phase 0.)*
- **`schema`** — prints the JSON Schema generated from the Zod config (anti-drift for docs).

### Provider matrix (generation & embeddings chosen independently)

Generation `provider` and embeddings `embeddingsProvider` each ∈ `ollama|openai`; endpoint/key/model
chosen independently; keys fall back to `$OPENAI_API_KEY`/`$WANSHI_API_KEY` (legacy `$KG_API_KEY`).
Headline use case: **cloud generation + free local embeddings.**

### CLI / config flag families (defaults in the schema)

Input/output · generation · embeddings · chunking · retrieval · merging · **grounding** (+ MiniCheck) ·
**corpus glossary** + **AST** · classifier · audio/ASR (+ `dual`) · images + **EXIF/C2PA/CV detection** ·
PDF engine (+ tuning) · **references & citations** (Phases 0–2, network opt-in) · **cost metering**
(+ `--max-cost`) · **SQLite adapter** · **trace** · export · resume · logging. `wanshi schema` is the
authoritative surface; `outline`/`jsonReader`/`dotOptions` are YAML-only.

### Export formats (`src/core/export/strategies/`)

`json` · `jsonl` (round-trips via `fromJSONL`) · `mcp-jsonl` · `dot` (ts-graphviz, `dotOptions`) ·
`kblam` (one value per (name, property)) · `lora` (grounding-filtered SFT) · `graphiti`
(`add_triplet`-shaped nodes/edges).

---

## §4 — Subsystems worth knowing

Production-quality additions, several landed since the last snapshot. Cross-check `CLAUDE.md` for the
detailed contracts.

- **Checkpoint / resume** (`core/checkpoint/`) — per-chunk SHA1 key over (relPath, chunkIndex, content,
  model, promptVersion, + glossary/classifier/grounding/schema). Re-run the same command to continue;
  done chunks skip, no re-billing. **Production-ready.**
- **Graceful shutdown** (`shared/shutdown.ts`) — module-singleton flag; first interrupt finishes the
  in-flight chunk, checkpoints, merges + exports the partial graph; second force-quits.
- **AST-seeded code extraction (Phase 8)** (`processor/ast/`) — deterministic Tree-sitter symbol pass via
  the published `@wanshi-kg/outlion` Symbol API; content-hash cached; default on.
- **Grounding / MiniCheck (Phase 5)** (`knowledge/` + `quality/FactualMetrics`) — inline gate; keyword
  overlap pre-filter + optional Bespoke-MiniCheck NLI via Ollama; `flag`/`drop` modes.
- **Reference & citation resolution (Phases 0–2)** (`knowledge/references/`) — network-free link/citation
  → edges; reference-follow worklist ingestion; gated web fetcher (Phase 1); citation span-fetch +
  GROBID + MiniCheck faithfulness (Phase 2). All default off / offline.
- **Cost / token metering** (`core/cost/`) — central `meter.record` on every `generateStructured`;
  pre-run estimate, `--max-cost` cap (reuses the graceful-shutdown path), resume-safe ledger.
- **Debug run-trace** (`core/trace/`) — versioned append-only JSONL of every pipeline decision;
  observe-only (lineage IDs held outside the graph → byte-identical on/off). Off by default.
- **Image enrichment + CV** (`knowledge/images/`, `core/cv/`) — EXIF/C2PA → graph facts (reader-metadata
  → fragment, augments the VLM read); object-detection pre-pass (closed COCO-80 / zero-shot open-vocab) →
  VLM context + `depicts` edges. All `sourceAdapter`-tagged; default off.
- **Canonicalization** (`knowledge/canon/`) — complete-linkage HAC (default on) + embedding-blocked
  candidate generation + LLM adjudicator; merge-log.
- **Evaluation harness** (`src/evaluation/` + `scripts/benchmark.ts`) — standalone (not in the main
  pipeline). Datasets: **Rebel, CrossRE, RedocRED, SemEval-2010 T8, MINE** (the four-way fact-retention
  harness in `evaluation/mine/`). Exact + semantic P/R/F1; intrinsic quality scoring.
- **Quality metrics** (`src/quality/`) — structural / semantic / factual / consistency → 0–100 composite;
  importable and wired into the benchmark.
- **OpenAI-compatible path** (`OpenAICompatibleService`) — `response_format: json_schema` with a
  `json_object`+schema-in-prompt fallback; 3× retry with backoff; warns on `length` finish.
- **Frontend (`frontend/`, Next.js)** — a graph-explorer UI over the run lifecycle (schema-driven config
  form, SSE progress, force-graph view). Carries provenance/trust through the UI (tri-state trust badges),
  a debug/trace lineage inspector, and a sandboxed source/provenance view (click a fact's `locator` → open
  the original at the cited span). Spawns the CLI via `WANSHI_CMD/CWD/DATA_DIR` (runs from source when
  `dist/` is absent). Desktop packaging (Electron) deferred to post-release.

---

## §5 — Known issues & technical debt

The blocking Tier-0 issues from the prior snapshot (no tests, `export` stub, double-count-on-rerun, BERT
classifier) are **all resolved.** The live ledger is **`TECHDEBT.md`**; current themes:

- **Canon recall is the open frontier.** Threshold recalibration for `nomic-embed-text`, the parked
  adjudicator-recall spike, the surface-form co-occurrence gate (KG-12b, off by default).
- **Data-sink coverage gaps.** Readers shipped + unit-tested but **not live-validated** on real corpora;
  formats not yet built (Viber/Signal, iCal/vCard, schema/IDL lift, wikilinks); SQLite M2M/composite-PK/views.
- **Landed-subsystem deferrals.** Cost meter excludes embeddings + the classifier's direct-Ollama path;
  CV 2b forensics designed-not-built + image live-e2e deferred; reference path-keyed node consolidation.
- **Housekeeping.** Dead `NER_DOMAIN_EXAMPLES.examples` array; `corpus.clustering` stub; the frontend
  run-store + graph artifacts bake absolute paths (break on a repo move — repoint manually for now);
  gmail-connector PoC unwired. *(Resolved since last snapshot: the `document-outline-gen` pin → published
  `@wanshi-kg/outlion`.)*

---

## §6 — Functional requirements (reverse-engineered)

- **FR-1 Discovery.** Enumerate matching files from input + glob `filter` + `exclude`.
- **FR-2 Multi-format read.** Dispatch each file to a format-specific reader (~22); unknown/binary skipped gracefully.
- **FR-3 Chunking.** Size-bounded chunks with overlap; JSON split on structure; transcripts/email/chat packed into speaker turns.
- **FR-4 Extraction.** Per chunk, Zod-validated `{entities, relations}` under closed v5 enums; 3× retry; empty graph on permanent failure.
- **FR-5 Context retrieval.** Retrieve top-N relevant entities (per-chunk/per-file scope) for cross-file naming consistency.
- **FR-6 Provenance & grounding.** Stamp source/speaker/sourceAdapter/locator + bi-temporal axis; optional inline grounding gate.
- **FR-7 Merge.** 3-level hierarchical dedup + supersession + type election + files[] union.
- **FR-8 Reference resolution (opt-in).** Internal links/citations → edges; optional follow-ingestion, web fetch, citation span-fetch + faithfulness.
- **FR-9 Export.** Serialize to json / jsonl / mcp-jsonl / dot / kblam / lora / graphiti.
- **FR-10 Resume.** Per-chunk checkpoint keyed by extraction-affecting inputs; re-run skips done chunks.
- **FR-11 Graceful interrupt.** First interrupt finishes + checkpoints + exports the partial; second force-quits.
- **FR-12 Provider independence.** Generation/embeddings backends chosen independently; env-var key fallback.
- **FR-13 Cost control (opt-in).** Pre-run estimate, `--max-cost` cap, resume-safe ledger.
- **FR-14 Watch.** Re-process on file add/change/unlink.
- **FR-15 Benchmark (tooling).** Evaluate against Rebel/CrossRE/RedocRED/SemEval-2010/MINE via `npm run benchmark`.

---

## §7 — Non-functional requirements

- **Privacy / local-first.** Default keeps all data + compute on-box; cloud is strictly opt-in and per-concern.
- **Cost control.** Free local embeddings + metered generation; resume avoids re-billing; `--max-tokens`/`--max-cost` cap spend.
- **Robustness.** Per-file failure isolation; malformed JSON → text fallback; output-truncation warnings; embedding inputs adaptively shrink; references/cost/trace/CV all byte-identical when off.
- **Determinism knobs.** `--seed` + `temperature 0` (Ollama); benchmark runs default to temp 0.
- **Maintainability.** Strict TypeScript, interface-first, DI-swappable backends, single Zod config source, structured logging, ~81 test files.
- **Explicit NFR gaps (Scale tier):** no persistent embedding cache; no parallelism (serial chunks/files); no incremental reprocessing; no progress bars. *(The npm package shipped — `@wanshi-kg/wanshi` v0.1.0 — closing the prior "no packaged binary" gap.)*

---

## §8 — Where things stand & what's next

The correctness/vocabulary/canon/data-model/export sprint (old ROADMAP Phases 1–8) **landed** long ago,
and since the last snapshot three more streams closed:

- **Shipped to npm.** `@wanshi-kg/wanshi` **v0.1.0** is live (scoped — the org token can't mint the
  unscoped name; the installed command is still `wanshi`), published via a manual GitHub Actions workflow.
  The sibling lib `document-outline-gen` was published as `@wanshi-kg/outlion`; a measurement-extraction
  sibling, `metricat`, lives in the same org.
- **Benchmark stream closed (2026-06-23)** with two *validated* claims (gold-labeled, same-model, across
  deepseek-v4-pro / sonnet-4.6 / gpt-5.4): **(a) wanshi is a precision instrument** — it trades recall for
  precision, and the win *grows* with document length and model capability (Re-DocRED node-F1
  +3.4 → +10.1 → +17.4 pt as KGGen over-extracts and its precision craters); **(b) schema-aware typed
  extraction** via closed vocab lifts triple-F1 4–10× over KGGen, which has no closed-vocab mode.
  Sentence-level is near-parity; MINE (a recall-only retrieve+judge axis) favors KGGen's higher triple
  density — reported as context, not a headline. Methodology in [`benchmark/SCORING.md`](./benchmark/SCORING.md).
- **Frontend Phase A+B landed** (branch `frontend-provenance`): Sable's design-language convergence, the
  provenance/trust UI + debug-trace inspector, and the sandboxed source/provenance view.

**What's next** is tracked in the canonical [`ROADMAP.md`](./ROADMAP.md) (the post-release plan,
thesis-validation-first). The north-star remains **knowledge injection (KBLaM / LoRA on the M4)** — the
Phase-9 spike ran, but the core thesis is **not yet validated**, so it stands as the #1 open item. Behind
it: a local-model benchmark arm (the offline-first floor, owed), the Scale-tier infrastructure (persistent
cache, parallelism, incremental reprocessing), and the schema-first vs typeless **Experiment-2** decision.

---

*End of state briefing. Source-verified against `frontend-provenance` @ 2026-06-24. Where the README/ROADMAP
disagree with this document, trust this one — it was read off the code.*

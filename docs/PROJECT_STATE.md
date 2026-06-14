# wanshi — Project State

> **What this is:** a single, ground-truth briefing on wanshi as it actually exists in the code today — architecture, features, known issues, tech debt, and functional/non-functional requirements. It exists to seed a roadmap brainstorm, so it favors *what is real in `src/`* over what the README/ROADMAP aspire to.
>
> **Snapshot date:** 2026-06-05 · branch `master` (mid-refactor, working tree dirty).
>
> **How to read it:** §1–§4 = what the project is and does. §5 = what's broken or half-built. §6–§7 = the requirements (functional + non-functional) reverse-engineered from behavior. §8 = Cheetah's opinionated read on where to push next — *clearly labeled as opinion, not decided*. If you only read two sections before the brainstorm, read §5 (debt) and §8 (open questions).

---

## §1 — What wanshi is & project goals

**Elevator pitch.** wanshi is a TypeScript CLI that turns a directory of files (code, docs, PDFs, Office, HTML, JSON, audio/video, images) into a structured **knowledge graph** of entities, observations (facts), and relations. Extraction runs on a local LLM via **Ollama** *or* any **OpenAI-compatible** endpoint (OpenAI, OpenRouter, vLLM, Ollama Cloud). It chunks input, extracts per-chunk under a Zod schema, merges with 3-level hierarchical deduplication, and exports to JSON, JSONL, MCP-compatible JSONL, or GraphViz DOT.

**Core data model** (`src/types/KnowledgeGraph.ts`):

- `Entity` — `name` (unique id; snake_case for code/technical, original casing for proper nouns), `entityType`, `observations[]`, `files[]`, optional `chunk`/`totalChunks`.
- `Relation` — `from`, `to`, `relationType[]` (array of labels).
- `KnowledgeGraph` — `{ entities, relations }`.

**Stated goals vs. reality:**

| Goal (from README) | Reality today |
| --- | --- |
| Zero hallucination | *Aspirational.* Enforced only by prompt guidelines + a (standalone, not-in-pipeline) factual metric. No runtime grounding check. |
| Local-first | **Real.** Default is local Ollama for both generation and embeddings; nothing leaves the box unless you opt into a cloud provider. |
| Multi-format ingestion | **Real.** 11 readers covering text/code, Markdown, JSON, PDF, Office, HTML, RTF, images, audio/video. |
| Scalable / large codebases | *Partial.* Chunking + in-memory embedding cache + resume exist; **no parallelism, no persistent cache, no incremental reprocessing.** |
| MCP-ready | **Real (export only).** `mcp-jsonl` export format. Not an MCP server. |
| Production-ready | *Aspirational.* No test suite, several stubs, a known double-count bug (see §5). |

**Tech stack:**

| Concern | Tool |
| --- | --- |
| Language | TypeScript 5.6 (strict, ES6 target, CommonJS) |
| Runtime | Node.js 18+ |
| Generation | Ollama (`ollama` pkg) or OpenAI-compatible (`openai` pkg) |
| Embeddings | Ollama or OpenAI-compatible; default `mxbai-embed-large:335m` (local) |
| CLI | Commander.js (40+ options) |
| DI | custom async `DIContainer` |
| Schema | Zod + `zod-to-json-schema` |
| Chunking | `@langchain/textsplitters` `RecursiveCharacterTextSplitter` |
| Prompts | Handlebars (versioned templates) |
| DOT export | `ts-graphviz` |
| Logging | `tslog` via `LoggerFactory` |
| Testing | Jest + ts-jest **installed but unused** |

**License:** GPL-3.0.

---

## §2 — Architecture & processing pipeline

### Design patterns

- **Dependency injection.** Everything is wired through `DIContainer` with `TYPES.*` Symbol identifiers. All 16+ service registrations live in `src/core/di/ContainerFactory.ts`. Backends (Ollama vs OpenAI-compatible, for generation and embeddings independently) are chosen here by branching on `provider`/`embeddingsProvider`. To add a service: define an `I*` interface in `src/types/`, implement it, add a Symbol to `TYPES`, register a factory.
- **Strategy pattern, twice.** File readers (`FileReaderFactory` maps extensions → `FileReader` subclasses, first-match-wins) and export formats (`KnowledgeGraphExportService` delegates to `IExportStrategy` implementations).
- **Versioned prompts.** Handlebars templates under `src/core/llm/prompts/templates/` (`v1`–`v4`, plus `v4.5`). **Default is `v4.5`** (`PromptManager.ts:47`); `v5` was removed. Each version has `system.hbs` + `user.hbs`; partials and domain examples live in `partials/`.
- **Interface-first.** Every service has an `I*.ts` interface in `src/types/`; the LLM/embedding layer is fully behind `ILLMProvider`/`IEmbeddingProvider`, which is what makes the backend swap a one-line branch.

### End-to-end pipeline

```
CLI args / config.yaml
    ↓
ContainerFactory.create(options) → DIContainer
    ↓
DirectoryProcessor.processDirectory()
    ↓
FileDiscoveryService.discover()              ← glob filter + exclude
    ↓
For each file:                               ← [graceful interrupt checked between files]
  FileProcessor.processFile()                ← select reader → read → chunk → [classify]
  PromptManager.getSystemPrompt()            ← render Handlebars system template (+ domain examples)
  KnowledgeGraphBuilder.build()              ← per chunk:
       [interrupt? finish + stop]
       → retrieve context for THIS chunk (retrievalScope)
       → [resume? skip if already checkpointed]
       → render user prompt (+ domain hints + file outline)
       → LLM provider (Ollama | OpenAI-compatible) → Zod validate → [checkpoint append]
    ↓
KnowledgeMerger.merge()                      ← 3-level hierarchical dedup (runs once, at the end)
    ↓
KnowledgeGraphExportService.export()         ← json | jsonl | mcp-jsonl | dot
    ↓
Output file (+ <output>.checkpoint.jsonl if --resume)
```

`DirectoryProcessor` public surface: `processDirectory()` (entry), `processFiles()` (loop + accumulate), `processFile()` (read → prompt → build), `buildRetriever()` (private; chunk vs file scope), merge + export delegation.

### 3-level hierarchical merge (`KnowledgeMerger`)

Progressively stricter deduplication:

1. **Within-chunk** — local cleanup.
2. **Within-file** — aggressive: Jaro-Winkler × 0.7, embedding similarity × 0.8.
3. **Cross-file** — conservative: full `entitySimilarityThreshold` (default 0.9) on entity names (Jaro-Winkler), full `observationSimilarityThreshold` on observations (cosine similarity of embeddings).

Cross-file dedup can't be incremental, so **merge always runs once over all per-chunk graphs at the very end** — resume saves the expensive extraction calls, not the merge.

### Classifier → prompt routing & outline injection

When a classifier runs, the detected `ContentClass` feeds the prompt **two** ways:

- **Domain hints** (`primaryEntityTypes`/`primaryRelationTypes` from `NER_DOMAIN_EXAMPLES.ts`) → injected into the **user** prompt (`user.hbs` `{{domainHints}}`).
- **Domain examples** (full few-shot pairs from `partials/examples/<class>.md` via `CLASS_TO_PARTIAL`) → injected into the **system** prompt (`system.hbs` `{{domainExamples}}`).

Separately, `PromptTemplateEngine.enhanceContext()` generates a per-file structural **outline** (via the `document-outline-gen` lib, wrapped in `documentOutline.ts`) and injects it as `{{fileOutline}}`. Configured by the YAML-only `outline` group (default enabled).

---

## §3 — Feature & configuration surface (as built)

### File readers (`src/core/processor/readers/`)

| Reader | Extensions | Backend |
| --- | --- | --- |
| `TextReader` | `.txt`, most code/text | Built-in |
| `JsonFileReader` | `.json`, `.jsonl`, `.geojson` | Built-in — **registered before `TextReader`** so it claims JSON |
| `MarkdownReader` | `.md` | Built-in |
| `PdfReader` | `.pdf` | `pdf2json` |
| `HtmlReader` | `.html`, `.htm` | `cheerio` + `html-to-text` |
| `OfficeReader` | `.docx`, `.xlsx`, `.pptx` | `officeparser` |
| `RtfReader` | `.rtf` | `rtf-parser` |
| `ImageReader` | `.jpg`, `.png`, `.gif`, `.webp`, … | Vision model (Ollama) |
| `AudioReader` | `.mp3`, `.wav`, `.ogg`, `.m4a`, … (+ video → audio) | `nodejs-whisper` + `fluent-ffmpeg` |
| `DoclingReader` | `.pdf`, `.doc(x)`, `.ppt(x)` | Docling API (opt-in) |
| `BinaryReader` | unknown/binary | skips gracefully |

`JsonFileReader` compacts JSON (token savings) and chunks on **structure** — top-level array elements, an object's dominant array (e.g. `{conversations:[…]}`, sibling-key header preserved), or JSONL lines — packing to `jsonReader.maxChunkSize`, recursing one level into oversized elements. Malformed JSON falls back to raw text chunking (never throws).

### Commands (`src/cli/commands/`)

- **`process`** — one-shot directory processing. Wires SIGINT/SIGTERM/Ctrl+D to graceful shutdown (1st = finish in-flight chunk, checkpoint, flush partial graph; 2nd = force quit).
- **`watch`** — chokidar-based; re-process on add/change/unlink.
- **`export`** — ⚠️ **stub. The body is empty (`// TODO: DO something`).** It resolves a logger + options and does nothing. See §5.

### Provider matrix (generation & embeddings chosen independently)

| | Generation | Embeddings |
| --- | --- | --- |
| Provider | `provider` (`ollama`\|`openai`) | `embeddingsProvider` (`ollama`\|`openai`) |
| Endpoint | `host` (base URL when openai) | `embeddingsHost` |
| API key | `apiKey` (→ `$OPENAI_API_KEY`/`$KG_API_KEY`) | `embeddingsApiKey` (same fallback) |
| Model | `model` | `embeddingsModel` |

Default = local Ollama for both. The headline use case: **cloud generation + free local embeddings**, so dedup/retrieval costs nothing even on a metered generation provider.

### CLI / config flag surface (grouped)

> Full reference is in `README.md`. Nested groups **`outline`, `jsonReader`, `dotOptions` are YAML-only** (no CLI flags). Defaults shown.

- **Input/output:** `--config`, `-i/--input` (`.`), `-f/--filter` (`**/*`), `-e/--exclude`, `-o/--output` (`knowledge-graph.json`), `-d/--description`.
- **Generation:** `--provider` (`ollama`), `-m/--model` (`llama3.2`), `-h/--host` (`localhost:11434`), `--api-key`, `--temperature` (`0.1`), `--repeat-penalty` (`0.3`, Ollama), `--context-length` (`8192`, Ollama), `--max-tokens`, `--seed` (Ollama), `-s/--system`, `promptVersion` (YAML; `v4.5`).
- **Embeddings:** `--embeddings-provider` (`ollama`), `--embeddings-model` (`mxbai-embed-large:335m`), `--embeddings-host`, `--embeddings-api-key`, `--embeddings-max-input-chars` (`1024`, auto-shrinks).
- **Chunking:** `--chunking` (`enabled`), `-c/--chunk-size` (`2000`), `--overlap-size` (`100`).
- **Audio/ASR:** `--asr` (`enabled`), `--whisper-model` (`medium`), `--language` (`auto`), `--translate`.
- **Images/docs:** `--images` (`auto`), `--docling` (`false`).
- **JSON:** `--json-strategy` (`structural`\|`raw`); `jsonReader.{strategy,maxChunkSize}` (YAML).
- **Classifier:** `--classifier` (`disabled`\|`heuristic`\|`llm`\|`bert`) — **experimental** (see §5).
- **Retrieval:** `--retrieval` (`enabled`), `--retrieval-limit` (`3`), `--retrieval-scope` (`chunk`\|`file`; `file` = legacy).
- **Merging:** `--entity-similarity-threshold` (`0.9`), `--observation-similarity-threshold` (`0.9`), `--enable-similarity-merging` (`true`).
- **Export:** `--export-format` (`json`\|`jsonl`\|`mcp-jsonl`\|`dot`); `dotOptions.*` (YAML: layout, rankdir, colorScheme, clustering, legend, …).
- **Resume:** `--resume` (`false`), `--checkpoint` (`<output>.checkpoint.jsonl`).
- **Logging/runtime:** `-L/--log-level` (`info`), `-l/--log-file`, `-D/--debug`, `-S/--silent`, `-w/--watch`.

### Export formats (`src/core/export/strategies/`)

`json` (pretty object), `jsonl` (one entity/relation per line — **write-only**, the reader is commented out), `mcp-jsonl` (MCP-shaped JSONL for Claude Desktop), `dot` (styled GraphViz via `ts-graphviz`, configured by `dotOptions`: layout engine, rankdir, color scheme, clustering by type/file, legend, processing-config cluster).

---

## §4 — Subsystems worth knowing (newly landed, lightly documented)

These are recent, production-quality additions that the README/ROADMAP barely mention. They're the parts most likely to be *built on* during the brainstorm.

### Checkpoint / resume (`src/core/checkpoint/CheckpointService.ts`)

- **Work-unit key** = SHA1 of `(filePath, chunkIndex, chunkContent, model, promptVersion)`. Editing a file, changing chunk size (→ different content), switching models, or changing the prompt invalidates only the affected entries.
- `--resume` enables **both** write and read: start a long run, and if it dies (credits, crash) re-run the same command — done chunks are restored and skipped, no re-billing.
- Records store `model`/`promptVersion`; `load()` reports how many match the current run and warns when none do. Tolerates a truncated final line from an interrupted write.
- **Status: production-ready.**

### Graceful shutdown (`src/shared/shutdown.ts`)

Module-singleton flag (`shutdown.request()`/`isRequested()`/`reset()`). CLI wires signals to `request()`; the file loop (`DirectoryProcessor`) and chunk loop (`KnowledgeGraphBuilder`) poll `isRequested()` between units. First interrupt finishes the in-flight chunk, checkpoints, merges + exports the **partial** graph; second force-quits. **Status: production-ready.**

### Evaluation harness (`src/evaluation/` + `scripts/benchmark.ts`)

External precision/recall/F1 against RE datasets. **Status: production-ready, standalone (not in the main pipeline).**

- **Datasets** (`IDatasetLoader`): `RebelDataset`, `CrossREDataset` (single file or directory of domain splits; domain filter), `RedocredDataset` (Wikidata property → label mapping).
- **Matching:** `ExactMatcher` (normalize → string equality) and `SemanticMatcher` (embedding cosine, default threshold 0.80, batch warmup, exact fallback).
- **Metrics** (`TripleMetrics`): P/R/F1 at **entity / relation / triple** levels, with micro-averaging across samples.
- **Reporters:** `ConsoleReporter` (formatted table), `JsonReporter` (full per-sample report).
- **CLI** (`npm run benchmark -- …`): `--dataset rebel|crossre|redocred`, `--data-path`, `--limit`, `--match-threshold`, `--model`, `--host`, `--embeddings-model`, `--classifier`, `--prompt-version`, `--domain`, `--output`.

### Quality metrics (`src/quality/`)

Intrinsic (no ground-truth) scoring. Static methods; **importable AND wired into `BenchmarkRunner`** (not into the main extraction pipeline). **Status: production-ready.**

- `KnowledgeGraphEvaluator` — structural: counts, type distributions, density, connected components, isolated entities.
- `SemanticEvaluator` — name quality, observation specificity, relation validity, domain coverage, type appropriateness.
- `FactualEvaluator` — hallucination score (keyword overlap with source), source grounding, contradiction detection.
- `ConsistencyEvaluator` — cross-file, naming, type consistency.
- `QualityScoreCalculator` — composite 0–100, weighted **structural 25 / semantic 30 / factual 30 / consistency 15**, plus recommendations. (Recent fix: empty/relation-less graphs no longer inflate to ~74 — they score correctly low.)

### OpenAI-compatible path

- `OpenAICompatibleService` (`ILLMProvider`) — `chat.completions` with `response_format: json_schema` (`strict:false`); **falls back to `json_object` + schema-in-prompt** when a provider/model rejects json_schema (handles Gemma-style endpoints). Retries 3× with backoff, strips code fences, warns on `length` finish reason (the usual cause of JSON parse failures = output budget exhausted). `getModelCapabilities()` returns `[]` (no introspection — vision attached on faith when `--images`).
- `OpenAIEmbeddingService` (`IEmbeddingProvider`) — native array batching (100/req), in-memory cache.
- `embeddingUtils.ts` — both embedding services truncate to `embeddingsMaxInputChars` and **adaptively halve + retry** (floor 256 chars) when the model still rejects input as too long.

---

## §5 — Known issues & technical debt

Every item below was verified against source. Grouped by severity.

### Blocking / functional gaps

- **`export` command is a no-op.** `src/cli/commands/export.command.ts:13` — body is literally `// TODO: DO something`. The command resolves a logger and options and returns. Anyone invoking export-an-existing-graph gets nothing.
- **BERT classifier throws.** `src/core/processor/classifier/BertContentClassifier.ts:11` — `classify()` immediately throws `FileProcessingError("BERT classifier not implemented.", path)`. Yet `--classifier bert` is an advertised, DI-registered option. (The whole classifier feature is marked `[EXPERIMENTAL]` in `ProcessingOptions.ts:61`.)

### Correctness

- **Double-counting on plain re-run.** `DirectoryProcessor.ts:103-105` (self-documented TECH DEBT): if the output file exists, prior graphs are loaded for retrieval context **and also pushed into `knowledgeGraphs`**, so re-running *without* `--resume` re-merges the old output into the new one. A real data-integrity footgun for iterative use.
- **Silent swallow of malformed existing output.** `DirectoryProcessor.ts:111-117` — if the existing output file is unparseable JSON, the error is logged and ignored (`// log and ignore`); the prior graph is silently dropped from retrieval context.
- **`fileContent` hardcoded empty.** `KnowledgeGraphBuilder.ts:100` — `'' // TODO: What to do here? Do I need fileContent?` is passed where full file content could go. Worth verifying whether this weakens factual grounding / outline context for multi-chunk files.

### Hardcoded / placeholder returns

- `OpenAICompatibleService.getModelCapabilities()` → `[]` (no vision detection on the OpenAI path; intentional but limiting).
- `readConfig` unknown extension → `{} as ProcessingOptions` (silently loses config, no error).
- Classifier resolver `ContainerFactory.ts` `default: return undefined` for unknown classifier value.
- `HtmlReader.extractImages()` → always `[]` (documented placeholder).

### Dead / inactive code

- `NER_DOMAIN_EXAMPLES.examples` arrays — full input/output pairs that are **never read** (`buildDomainHints()` only uses `primaryEntityTypes`/`primaryRelationTypes`). Bundle weight, no effect.
- Commented-out blocks: `directoryTree` Handlebars helper (`PromptTemplateEngine.ts:101-114`), `fromJSONL` parser (`JsonlExportStrategy.ts:34-57` — JSONL is write-only, and the dead code references an undefined `logger`), entity file-consolidation in `KnowledgeMerger.ts:353-354`.

### Testing & hygiene

- **No real test suite.** `package.json` `"test"` runs `ts-node ./src/index.ts --config /Users/oleksii/Downloads/33/config.yml` — a hardcoded personal end-to-end run, not tests. Jest + ts-jest are installed and unused. Zero `*.test.ts`.
- `console.log` directly in evaluation reporters (`JsonReporter`, `ConsoleReporter`) instead of the injected `tslog` logger.
- Scattered `any` casts (e.g. `promptManager as any` in `ContainerFactory.ts:348`, `catch (error: any)`).

### Documentation drift

- `README.md` / `ROADMAP.md` still reference a removed `/test/` directory and a `v1–v5` prompt range. **Reality:** quality lives in `src/quality/`, the benchmark harness in `src/evaluation/`, and the default prompt is `v4.5` (`v5` removed). README's "Architecture" tree predates the new subsystems. (CLAUDE.md is the most current of the three.)

---

## §6 — Functional requirements (reverse-engineered)

Crisp, testable statements of what the system *does*. Useful as a baseline the brainstorm can extend or renegotiate.

- **FR-1 Discovery.** Given an input directory, a glob `filter`, and `exclude` patterns, enumerate matching files.
- **FR-2 Multi-format read.** Dispatch each file to a format-specific reader (11 types); unknown/binary files are skipped gracefully without aborting the run.
- **FR-3 Chunking.** Split file content into size-bounded chunks with configurable overlap; JSON is split on structure, not blindly.
- **FR-4 Extraction.** For each chunk, prompt the configured LLM and parse a Zod-validated `{entities, relations}` graph; retry 3× with backoff; on permanent failure return an empty graph and continue.
- **FR-5 Context retrieval.** When enabled and a prior graph exists, retrieve top-N relevant entities (per-chunk or per-file scope) and inject them into the user prompt for cross-file naming consistency.
- **FR-6 Classification routing (experimental).** Optionally classify content type and inject domain hints (user prompt) + domain examples (system prompt).
- **FR-7 Merge.** Apply 3-level hierarchical dedup (within-chunk → within-file → cross-file) using Jaro-Winkler (names) + embedding cosine (observations) against configurable thresholds.
- **FR-8 Export.** Serialize the merged graph to one of `json` / `jsonl` / `mcp-jsonl` / `dot`.
- **FR-9 Resume.** With `--resume`, checkpoint each chunk to a sidecar keyed by content+model+prompt; on re-run, skip matching chunks. (Re-run *without* `--resume` currently double-counts — see §5.)
- **FR-10 Graceful interrupt.** First interrupt finishes the in-flight chunk, checkpoints, merges, and exports the partial graph; second force-quits.
- **FR-11 Provider independence.** Generation and embeddings backends (Ollama / OpenAI-compatible) are selected independently; API keys fall back to env vars.
- **FR-12 Watch.** In watch mode, re-process on file add/change/unlink.
- **FR-13 Benchmark (tooling).** Evaluate extraction against REBEL / CrossRE / RE-DocRED with exact + semantic P/R/F1 and intrinsic quality scoring, via `npm run benchmark`.

---

## §7 — Non-functional requirements

- **Privacy / local-first.** Default keeps all data and compute on-box (Ollama). Cloud is strictly opt-in and per-concern (you can keep embeddings local while generation is remote).
- **Cost control.** Free local embeddings + metered generation is the headline pattern; `--resume` ensures an interrupted paid run isn't re-billed; `--max-tokens` caps output spend.
- **Robustness / graceful degradation.** Per-file failure isolation (empty graph, continue); malformed JSON falls back to text chunking; output-budget truncation is detected and warned; embedding inputs adaptively shrink to survive context limits.
- **Determinism knobs.** `--seed` + `temperature 0` for reproducibility (Ollama); benchmark runs default to temp 0, chunking off.
- **Token efficiency.** Compact JSON re-serialization, structure-aware chunking, outline toggle to trade context for tokens.
- **Maintainability.** Strict TypeScript, interface-first, DI-swappable backends, structured `tslog` logging.
- **Explicit NFR gaps (today):**
  - No **persistent** embedding cache — the in-memory cache dies with the process; identical re-runs re-embed everything.
  - No **parallelism** — chunks/files are processed serially.
  - No **incremental reprocessing** — a changed file means the whole run logic re-touches it (though checkpointing partially mitigates re-extraction).
  - No progress UX (bars/ETAs), no packaged npm binary.
  - No automated tests → no regression safety net before refactors.

---

## §8 — Gap analysis & where I'd push next

> **This section is Cheetah's opinion, not a decision.** It's deliberately a bit pointed so the brainstorm has something to push against. Everything in §1–§7 is ground truth; everything here is a take. Each item names *what already exists to build on* so the effort estimates are grounded.

### Tier 0 — debt to clear before any big feature

- **Stand up a real test harness.** The DI design already makes this cheap: `KnowledgeGraphBuilder` takes an `ILLMProvider`, so inject a stub and you get deterministic, network-free tests. Start with `TextChunker`, `KnowledgeMerger`, `CheckpointService` (pure logic, high value), then a mocked end-to-end. *Without this, every refactor below is flying blind.* Low risk, high leverage.
- **Kill the re-run double-count bug** (`DirectoryProcessor.ts:103`). Separate "prior graph for retrieval context" from "graphs to merge into output." Small change, removes a silent data-corruption footgun, and is a prerequisite for incremental updates.
- **Resolve the two advertised-but-broken features:** either implement or remove the `export` command and the BERT classifier. Shipping a CLI that lists options which no-op or throw is a credibility tax.

### Tier 1 — high leverage, low risk

- **Persistent embedding cache.** Today's cache is in-memory only; a file-backed (or SQLite/LMDB) LRU survives restarts and turns repeat runs nearly free on the embedding side. The `IEmbeddingProvider` interface is the natural seam — wrap it. ROADMAP already lists this (Phase 6); it's the cheapest big win.
- **Parallel chunk/file workers.** Extraction is embarrassingly parallel per chunk. A bounded worker pool would cut wall-clock dramatically, especially against cloud providers with rate headroom. Watch interaction with Ollama's single-model concurrency.
- **Progress UX.** Cheap, high perceived value for long runs.

### Tier 2 — strategic bets (ROADMAP, grounded against current code)

- **Incremental updates** (only reprocess changed files). The checkpoint key already fingerprints `(file, chunk, content, model, prompt)` — half the machinery exists. Combine with the bug fix above and a file-mtime/hash manifest and you get true incremental indexing. *Open question: where does the canonical prior graph live — the output file, or a dedicated store?*
- **Vector DB (Chroma) / graph DB (Neo4j).** Today retrieval is in-memory cosine over the current graph. A real vector store unlocks large-corpus retrieval; Neo4j unlocks traversal queries on the output. *Open question: is the value in better extraction-time retrieval, or in a queryable end product — or both?*
- **Cross-encoder reranking + quality-aware context selection.** Builds on §4 retrieval; only worth it once retrieval is the bottleneck.
- **LoRA dataset generation from quality-scored graphs.** `src/quality/` already produces per-graph composite scores — that's the filter for harvesting high-quality extraction examples into a fine-tuning set. Closes the loop toward the stated research goals.

### Decision points to seed the Dove session

1. **Identity:** is wanshi a *local-first CLI tool for me* (l-lang philosophy) or aiming at *publishable/production* (npm binary, tests, stability)? This single answer reorders Tiers 0–2.
2. **Output as artifact vs. store:** is the deliverable a static graph file, or a live queryable store (vector/graph DB)? Determines whether Tier 2 DB work is core or optional.
3. **Where does the graph live across runs?** Answering this unblocks both the double-count fix and incremental updates.
4. **Quality loop:** do we invest in the eval/quality subsystems as a *research instrument* (leaderboards, LoRA data) or keep them as occasional diagnostics?
5. **Classifier's future:** the experimental classifier adds real complexity (routing, domain examples, an unimplemented BERT path). Double down, simplify to heuristic-only, or cut?
6. **Cloud posture:** how much to optimize for the cloud-generation + local-embeddings path (batching, rate limits, cost telemetry) vs. staying Ollama-centric?

---

*End of state briefing. Source-verified against `master` @ 2026-06-05. The README/ROADMAP remain useful for prose and the leaderboard tables, but where they disagree with this document, trust this one — it was read off the code.*

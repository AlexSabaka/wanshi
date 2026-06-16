# CLAUDE.md — Agent Instructions for wanshi

## Project Overview

**wanshi** is a TypeScript CLI tool that transforms files and codebases into structured knowledge graphs using local LLMs via Ollama or any OpenAI-compatible API provider. It extracts entities, observations (facts), and relations, then merges them into a queryable knowledge graph exportable in JSON, JSONL, MCP-compatible JSONL, or GraphViz DOT formats.

**LLM providers**: generation runs on local Ollama *or* any OpenAI-compatible endpoint (OpenAI, OpenRouter, vLLM, Ollama Cloud, …), selected via `provider`/`host`/`apiKey`. Embeddings are configured independently (`embeddingsProvider`/`embeddingsHost`/`embeddingsApiKey`) and default to local Ollama, so dedup/retrieval stays free even when generation is on a metered cloud. See [LLM Providers & Resume](#llm-providers--resume).

## Tech Stack

| Concern | Tool |
| ------- | ---- |
| Language | TypeScript 5.6 (strict mode, ES6 target, CommonJS modules) |
| Runtime | Node.js 18+ |
| LLM | Ollama via `ollama` npm package, or any OpenAI-compatible API via `openai` npm package |
| CLI | Commander.js |
| DI | Custom async `DIContainer` |
| Schema validation | Zod + `zod-to-json-schema` |
| Text splitting | `@langchain/textsplitters` `RecursiveCharacterTextSplitter` |
| Prompt templating | Handlebars |
| Embeddings | Ollama embeddings API or OpenAI-compatible (default: local `mxbai-embed-large:335m`) |
| Logging | `tslog` via `LoggerFactory` |
| Testing | Jest + ts-jest (active unit/integration suite, network-free via mocked `ILLMProvider`) |

## Development Commands

```bash
npm start                     # Run CLI via ts-node (development)
npm run build                 # Compile TypeScript → dist/
node ./dist/index.js          # Run compiled binary
npx nodemon                   # Auto-restart on file changes

# Example run against a config
npx ts-node ./src/index.ts --config config.yaml

# Benchmark extraction quality against CrossRE dataset
npm run benchmark -- --dataset crossre --data-path ./data/crossre/crossre_data/ai-test.json --limit 20
# Options: --dataset rebel|crossre  --limit N  --match-threshold 0.80
#          --model <ollama-model>  --classifier disabled|heuristic|llm|cascade
#          --output ./results/run.json  (saves full per-sample JSON report)
```

> `npm test` runs the Jest suite (`jest`). `npm run benchmark` is a separate extraction-quality harness against external RE/KG datasets, not unit tests.

## Project Structure

```plain
wanshi/
├── src/
│   ├── index.ts                          # Main re-export entry point
│   ├── cli/
│   │   ├── index.ts                      # CLI entry point (Commander.js, 40+ options)
│   │   └── commands/
│   │       ├── process.command.ts        # One-shot directory processing
│   │       ├── watch.command.ts          # Watch mode (chokidar)
│   │       └── export.command.ts         # Export existing graph
│   ├── core/
│   │   ├── DirectoryProcessor.ts         # ★ Main orchestrator — start here
│   │   ├── di/
│   │   │   ├── DIContainer.ts            # Async DI container with singleton management
│   │   │   ├── ContainerFactory.ts       # All 16+ service registrations
│   │   │   └── index.ts                  # TYPES symbols (service identifiers)
│   │   ├── llm/
│   │   │   ├── OllamaService.ts          # Ollama integration, structured generation (Zod)
│   │   │   ├── OpenAICompatibleService.ts # OpenAI-compatible generation (response_format json_schema + fallback)
│   │   │   ├── EmbeddingService.ts       # Ollama embeddings with in-memory cache
│   │   │   ├── OpenAIEmbeddingService.ts # OpenAI-compatible embeddings (native batching + cache)
│   │   │   └── prompts/
│   │   │       ├── PromptManager.ts      # Prompt orchestration
│   │   │       ├── PromptTemplateEngine.ts # Handlebars rendering + context enhancement
│   │   │       └── templates/
│   │   │           ├── v1 … v4.5, v5/    # Versioned prompt templates (v5 = default; v4.5 = legacy)
│   │   │           └── partials/         # Reusable partials + domain examples
│   │   ├── checkpoint/
│   │   │   └── CheckpointService.ts      # Per-chunk resume sidecar (JSONL) for --resume
│   │   ├── corpus/                       # Corpus pre-pass: term frequency + glossary (--corpus-profiling)
│   │   │   ├── CorpusAnalyzer.ts         # Build/load CorpusProfile (freq + cached class + LLM glossary)
│   │   │   ├── termFrequency.ts          # Pure term counter (content words + proper-noun runs)
│   │   │   └── CorpusProfileStore.ts     # Cached sidecar (<output>.corpus-profile.json)
│   │   ├── processor/
│   │   │   ├── FileProcessor.ts          # Read → chunk → classify pipeline
│   │   │   ├── readers/                  # 13 file type readers (see below)
│   │   │   ├── chunking/TextChunker.ts   # RecursiveCharacterTextSplitter wrapper
│   │   │   └── classifier/               # Heuristic / LLM / cascade classifiers (opt-in)
│   │   ├── knowledge/
│   │   │   ├── KnowledgeGraphBuilder.ts  # LLM extraction with Zod schema validation
│   │   │   ├── merging/KnowledgeMerger.ts # 3-level hierarchical merge
│   │   │   └── search/KnowledgeGraphSearch.ts # Multi-strategy context retrieval
│   │   ├── export/
│   │   │   ├── KnowledgeGraphExportService.ts # Export orchestrator (strategy pattern)
│   │   │   └── strategies/               # json, jsonl, mcp-jsonl, dot implementations
│   │   ├── trace/                        # Debug run-trace: TraceWriter singleton + mention-instance lineage (off by default)
│   │   └── adapters/                     # Structured-emit adapters: IStructuredAdapter + registry (data-sink track)
│   ├── types/
│   │   ├── KnowledgeGraph.ts             # Entity, Relation, KnowledgeGraph types
│   │   ├── ProcessingOptions.ts          # Full CLI/config options interface
│   │   └── I*.ts                         # Service interfaces
│   └── shared/
│       ├── logger/                       # Logger interface + tslog factory
│       └── utils/                        # cosineSimilarity, jaroWinklerSimilarity, etc.
├── src/quality/                          # Importable quality metrics (structural, semantic, factual, consistency)
├── src/evaluation/                       # Benchmark harness: datasets (CrossRE/REBEL), matching, metrics, reporters
├── data/crossre/crossre_data/            # Downloaded CrossRE domain splits (gitignored)
├── scripts/benchmark.ts                 # Standalone benchmark CLI (ts-node)
├── examples/                             # Sample integrations (each a standalone subproject)
│   ├── kg-telegram-sink/                # Telegram → wanshi graph bot (+ A/B canon config)
│   ├── kg-mail-assistant/                # Full Gmail-to-KG example
│   ├── canon/                            # Canonicalization A/B arm configs
│   └── sandbox/                          # Ad-hoc throwaway scripts (t3–t6)
├── audio-pipeline/                       # Vendored Python subproject: Silero VAD + Parakeet/Whisper dual-STT + diarization (the `dual` ASR engine; Apple-Silicon/MLX)
└── doc-classifier/                       # Related document classifier subproject (Python)
```

## Core Data Model

```typescript
// src/types/KnowledgeGraph.ts
interface Entity {
  name: string;            // Unique identifier — snake_case for code/technical entities; original casing for proper nouns
  entityType: string;      // Category: "class", "function", "concept", "person", etc.
  observations: Observation[]; // Provenance-stamped facts (see below)
  files: string[];         // Source file paths
  chunk?: number;          // Chunk index (1-based) if file was split
  totalChunks?: number;    // Total chunks in source file
}

// src/types/Observation.ts — observations are objects, not bare strings.
interface Observation {
  text: string;
  speaker?: string;   // per-observation provenance: who asserted it
  source?: string;    // origin file/path
  validAt?: string;   // bi-temporal valid time (true in the world from)  [Graphiti-verbatim]
  invalidAt?: string; // valid time end
  createdAt?: string; // transaction time: when extracted/ingested
  expiredAt?: string; // transaction time: when superseded (facts are superseded, never deleted)
  sourceAdapter?: string; // ECS source-tagging: which adapter produced it ("pdf:mistral","sqlite",…)
  locator?: string;       // where in the source ("p.67","table:parts/row:42")
}
```

**ECS source-tagging (`sourceAdapter` + `locator`).** Every fact is attributable to the
adapter that produced it and where in the source. `sourceAdapter` is stamped **centrally** by
`FileProcessor` from the matched reader's `adapterId()` (PDF engines → `pdf:mistral` etc.; a
reader may pre-set a finer id); `locator` is reader-supplied where meaningful (the per-page PDF
readers stamp `p.<n>`). Both flow `ChunkProvenance` → `KnowledgeGraphBuilder.toGraph()` →
`Observation`. Structured-emit adapters (below) stamp them directly on the facts they emit.

**Provenance is built, not asked of the model.** The LLM still emits observations as
bare strings; `KnowledgeGraphBuilder.toGraph()` wraps each into an `Observation`,
stamping `source`/`speaker`/`validAt` from the chunk's `ChunkProvenance` (reader-supplied)
plus `createdAt`. Read sites use the `obsText()` / `normalizeObservations()` helpers and
tolerate legacy bare-string data; **MCP export downgrades to bare strings** so the memory
server stays compatible.

**Closed-vocabulary enums (entityType + relationType).**
`KnowledgeGraphBuilder.buildGraphSchema(allowedTypes, allowedRelationTypes)` constrains
**both** fields to Zod **enums** (v5): `entityType` = domain `primaryEntityTypes` ∪ corpus
glossary `entityTypes` ∪ `BASE_ENTITY_TYPES` ∪ `other`; `relationType` = glossary
`relationTypes` ∪ `BASE_RELATION_TYPES` ∪ `related_to`. The vocabularies are **always
closed** — `resolveAllowedTypes`/`resolveAllowedRelationTypes` fall back to the base sets
even with no class and no glossary, so a one-off type/predicate can't be invented. The
escapes (`other`, `related_to`) prevent validation-failure recall loss;
`KnowledgeMerger.logVocabularyFit` logs the catch-all fraction (Dove's guardrail — a high
`related_to` % means the closed set is too tight). The `BASE_*` constants mirror the
`{{else}}` base lists in `templates/v5/system.hbs` (keep them in sync).

**Inline grounding gate (`--grounding`).** After each chunk is extracted,
`KnowledgeGraphBuilder.applyGroundingGate()` scores every observation against its source
chunk via `FactualEvaluator.observationGroundingScore()` (keyword overlap; the seam for a
stronger NLI-style check). Modes: `disabled` (default), `flag` (annotate each observation
with `grounded`/`groundingScore`, keep all), `drop` (remove observations below
`--grounding-min-score`, default 0.5). Runs before checkpoint/merge, so ungrounded facts
never reach the output.

```typescript
interface Relation {
  from: string;           // Source entity name
  to: string;             // Target entity name
  relationType: string[]; // Array of relation type strings
}

interface KnowledgeGraph {
  entities: Entity[];
  relations: Relation[];
}
```

## Architecture Patterns

### 0. Configuration (single source of truth)

`src/config/schema.ts` is the **one** definition of the config: a nested Zod
`ConfigSchema` from which everything derives — the `ProcessingOptions` type
(`z.infer`, re-exported through `src/types/ProcessingOptions.ts`), runtime
validation + **all defaults** (`parseConfig`), and the JSON Schema served to the
frontend (`configJsonSchema` / the `wanshi schema` command). The shape is
**nested** (`llm`, `embeddings`, `chunking`, `retrieval`, `merging`, `grounding`,
`corpus`, `classifier`, `readers`, `references`, `export`, `resume`, `trace`, `logging`,
`runtime`; with `input`/`filter`/`exclude`/`output`/`description` top-level). Config files use
this nested shape — a legacy flat key errors with a migration hint (`src/config/
legacyHints.ts`, docs/MIGRATION.md). **CLI flags stay flat** and ergonomic; `cli/
optionsToConfig.ts` (`FLAG_TO_PATH`) maps them onto nested paths, merged as
**defaults < file < CLI < env** then validated once. Defaults live **only** in the
schema — don't add `?? fallback`s in services or `.option()` defaults in the CLI.
Adding a config field = add it to the schema (+ `FLAG_TO_PATH` for a CLI flag,
`legacyHints` if it had a flat name, `ui.ts` for the form). Tests build configs
via `makeConfig(partial)` (helpers), not hand-rolled flat objects.

### 1. Dependency Injection

All services are managed by `DIContainer`. Use `TYPES.*` Symbol identifiers to register and resolve:

```typescript
// ContainerFactory.ts pattern
container.register(TYPES.SomeService, () => new SomeService(dep1, dep2));
const svc = container.get<ISomeService>(TYPES.SomeService);
```

**To add a new service**: implement its interface, register in `ContainerFactory.ts`, add a Symbol to the `TYPES` map in `ContainerFactory.ts` (re-exported via `src/core/di/index.ts`).

### 2. Strategy Pattern — File Readers

`FileReaderFactory` maps file extensions to reader implementations (first-match-wins). All readers extend the abstract `FileReader` base class. Each exposes `adapterId()` (the `sourceAdapter` tag stamped onto every fact).
**To add a new file format**: implement `FileReader`, register in `FileReaderFactory.ts`.

**PDF engine selector.** The PDF slot is chosen by `readers.pdfEngine` (`pdf2json` default | `docling` | `marker` | `mistral`), not a boolean — the dispatch in `ContainerFactory` registers the chosen reader; `marker`/`mistral` degrade to `pdf2json` on failure. The legacy `readers.docling: true` errors with a `readers.pdfEngine: docling` migration hint. `MarkerPdfReader` shells the `marker_single` CLI; `MistralOcrReader` is native HTTP (Mistral OCR API).

### 2b. Strategy Pattern — Structured-emit adapters (data-sink track)

Beside the text→LLM-extract path, a **structured source** (graph-native: a SQLite `.db`, an OpenAPI spec, …) can map DIRECTLY to graph fragments via `IStructuredAdapter` (`src/core/adapters/`). `StructuredAdapterRegistry` (DI-registered, **empty by default**) is consulted in `DirectoryProcessor.processFile`: a matched file's fragment is emitted into the per-file `graphs[]` union (the same union the AST seed + reference graph use), bypassing the LLM, still going through merge/canon. Adapters stamp `sourceAdapter`/`locator` on the facts they emit. Phase 0 (the seam + provenance field) is in; concrete adapters (SQLite first) land per their own briefs.

### 3. Strategy Pattern — Export Formats

`KnowledgeGraphExportService` delegates to registered `IExportStrategy` implementations. `ProcessingOptions` is forwarded to strategies — `DirectoryProcessor` passes it through `export(graph, format, options)`, and the DOT strategy reads `dotOptions` (config-only; layout, rankdir, colorScheme, clustering, legend, …) plus the graph title and processing-config cluster.
**To add a new export format**: implement `IExportStrategy`, register in `KnowledgeGraphExportService`.

Formats: `json` · `jsonl` · `mcp-jsonl` (memory-server compatible) · `dot` · and the **KBLaM/LoRA-prep** trio (Phase 4):
- **`kblam`** — JSONL `DataPoint`s `{name, description_type, description, Q, A, key_string}`, the on-disk shape KBLaM's `dataset_generation` ingests. Observations → `(entity, "fact", text)`; relations → `(from, relationType, to)`. Feeds KBLaM's KB-embedding step.
- **`lora`** — chat SFT JSONL (`{messages:[user Q, assistant A]}`) from the same triples, **quality-filtered**: observations below `--grounding-min-score` (Phase 3 `groundingScore`) are dropped, so only grounded facts train.
- **`graphiti`** — `add_triplet`-shaped `{nodes: EntityNode[], edges: EntityEdge[]}` (bi-temporal ingestion target). Entities→nodes (summary from observations), relations→edges with `created_at`; per-fact valid-time stays in `json`/`kblam` (fact-as-temporal-edge is a future refinement).

### 4. Hierarchical Merging (3 Levels)

`KnowledgeMerger` applies progressively stricter deduplication:

- **Within-file**: Jaro-Winkler threshold × 0.7, embedding similarity × 0.8 (aggressive)
- **Cross-file**: Full `entitySimilarityThreshold` (default 0.9), full `observationSimilarityThreshold` (conservative)
- Entity names: Jaro-Winkler similarity
- Observations: Cosine similarity of embeddings (provider-selectable)
- **Provenance-preserving:** `deduplicateObservations` partitions by provenance identity (`source␟speaker`) and only collapses near-duplicates *within* a group — the same fact from two sources/speakers stays as two attributed `Observation`s, never one flattened string.

**Post-merge canonicalization** (`Canonicalizer`, opt-in `pipeline.canonicalization.enabled`) is a separate global pass: embedding-cluster surface forms, then for the `llm`/`hybrid` methods **adjudicate** borderline pairs in the escalate band. The adjudicator's system prompt is config-driven — `canonicalization.llm.guidance` (default in `schema.ts`). The default is the "softened+few-shot" guidance that won the adjudicator-**recall** bake-off (`examples/sandbox/canon-escalation-spike.ts --adjudicate`): it licenses abbreviation/containment/casing/camel↔snake/plural aliases while still rejecting version/size/model and instance-vs-category hypernyms — replacing the old `"Be conservative"` line that was suppressing true code aliases (self/code escalate-band recall 2/8→4/8, overall 2/9→5/9 on gemma4:31b, hypernym-accept held at 0). The trace layer emits the adjudicator verdict (`Canonicalizer.ts`, `adjudicatorVerdict`) for production-run recall analysis.

### 5. Prompt Versioning

Templates live in `src/core/llm/prompts/templates/` (`v1`–`v4`, `v4.5`, `v5`). Default is **v5** (set in `PromptManager.ts`); select another with `--prompt-version` / config `promptVersion` (e.g. `v4.5` for the legacy prompts). Each version has `system.hbs` and `user.hbs` (Handlebars; engine compiles with `noEscape: true`, so `{{var}}` is safe for code/JSON). Partials live in `templates/partials/` and domain examples in `partials/examples/`.

**v5** is the "closed-vocabulary + topology-hygiene" rewrite (the prompt-side mirror of the Zod enums): the system prompt declares the controlled entity/relation vocabularies (overridden by the corpus glossary's `entityTypeVocabulary`/`relationTypeVocabulary` when present, else a base set) and the relation-topology rules (one canonical predicate per edge, no self-loops, consistent direction, no type-pair predicates); the corpus glossary is promoted from a soft hint to **authoritative**. `${pwd}`/`${filter}` (a latent no-interpolation bug in ≤v4.5) are `{{inputDirectory}}`/`{{filter}}` in v5. The `partials/examples/*.md` were rewritten to stop teaching sprawl (`EXAMPLE_STYLE_GUIDE.md` is the spec: one-element `relationType`, reused lowercase types, literals-as-observations, no self-loops) — these are **shared across versions**, so they improve v4.5 too.

Glossary generation also has v5 templates: `templates/v5/glossary/{system,user}.hbs`, rendered by `PromptManager.getGlossaryPrompt()` (injected into `CorpusAnalyzer`); falls back to the inline `FALLBACK_GLOSSARY_SYSTEM` string when the active version ships no glossary template (e.g. v4.5).

### 6. Classifier → Prompt Routing (two-part system)

When a classifier runs, the detected `ContentClass` is used in **two separate ways** by `PromptManager`:

- **Domain hints** — built from `NER_DOMAIN_EXAMPLES.ts` (`primaryEntityTypes` + `primaryRelationTypes`), injected into the **user prompt** (`user.hbs`) as `{{domainHints}}`. Renders as a short bulleted list steering the model toward domain-appropriate terminology.
- **Domain examples** — loaded from `partials/examples/<class>.md` via `CLASS_TO_PARTIAL`, injected into the **system prompt** (`system.hbs`) as `{{domainExamples}}`. Full few-shot input→output pairs showing what to extract for that content type.

`NER_DOMAIN_EXAMPLES.ts` also has an `examples` array per domain — this is **dead code**; `buildDomainHints()` only reads `primaryEntityTypes`/`primaryRelationTypes`.

### 7. Document Outline injection

`PromptTemplateEngine.enhanceContext()` generates a per-file structural outline (via the `document-outline-gen` lib, wrapped in `documentOutline.ts`) and injects it into the user prompt as `{{fileOutline}}`. Configured by the YAML-only nested `outline` group (`enabled` default true, plus `maxDepth`/`includeLineNumbers`/`includePrivate`/`includeComments`), threaded `ContainerFactory` → `PromptManager` ctor → `PromptTemplateEngine`. Set `outline.enabled: false` to skip it (saves tokens, silences outline warnings).

**To add or improve a domain**, edit both files together:

1. `src/core/processor/classifier/NER_DOMAIN_EXAMPLES.ts` — update `primaryEntityTypes` / `primaryRelationTypes` for the domain
2. `src/core/llm/prompts/templates/partials/examples/<class>.md` — add/improve worked examples (2+ input→output pairs in the standard format)

### 8. Reference & link resolution (Phase 0, network-free, default OFF)

Turns the references a document *already contains* into deterministic edges (no LLM, no
network), gated by the nested `references` group (`internalLinks.enabled` /
`citations.enabled`, both default false; flags `--reference-links` / `--reference-citations`).
Two stages, mirroring the AST-seed pattern:

- **Readers extract → `metadata.references`.** `referenceExtraction.ts` (pure): markdown
  `[t](u)` + `[[wikilinks]]`, HTML `href`, and a hybrid citation parser — Citation.js
  (lazy `require`) for BibTeX blocks, regex fallback (arXiv/DOI/PMID + entry splitting) for
  prose bibliographies + inline ids. Wired into `MarkdownReader` (links+cites), `HtmlReader`
  (links), `PdfReader` (cites; drops the paper's own arXiv id). The `splitTrailingReferences`
  block is now *parsed*, not only discarded. Off ⇒ readers skip extraction entirely.
- **`ReferenceResolver.buildReferenceGraph()`** (pure module, called per-file in
  `DirectoryProcessor.processFile` after the AST seed): resolves internal links against a
  corpus-relpath set (`toRelPathId`) → `links_to` edges between path-keyed `document` nodes
  (`resolved:true`), or a stub node + `resolved:false` for a missing target; citations →
  `cites` edges (`resolved:false`; fetch is Phase 1/2) with stated ids/title as observations.
  Both endpoints are always emitted so the merger's dangling-edge gate never drops a reference
  edge. Edge types are **around-schema** plain strings (not in `BASE_RELATION_TYPES` → no LLM
  instruction creep). `Relation` carries `source` (emitting doc) + `resolved`, preserved
  through merge. *Known debt:* path-keyed `document` nodes overlap with
  `documentIdentityGraph`'s title-named node — consolidation is a follow-up.

**Reference-driven ingestion (`references.follow`, `--reference-follow`, default OFF).**
`DirectoryProcessor.processFiles` is a **worklist** (queue of `{file, depth}`) guarded by a
shared `ProcessedRegistry` (`src/core/processor/ProcessedRegistry.ts`; in-run, keyed by
`toRelPathId` + optional content-hash) so a file is read/extracted **at most once** however
it's reached. With follow on it seeds from `follow.seeds` (e.g. `INDEX.md`) — else the glob
set — and after each file enqueues its resolved internal-link targets (reusing
`resolveInternalTarget` over the **whole input tree**, not just the glob), bounded by
`follow.maxDepth` (0 = unlimited) and `follow.maxFiles`. Cycles are impossible (registry);
external targets are skipped (handled by the web fetcher below); follow auto-implies
`internalLinks`. Distinct from the resume checkpoint (per-*chunk* extraction dedup across
runs; the registry is per-*file* read dedup within a run — they compose).

**Phase 1 — gated web fetcher (`references.web`, `--reference-web`, default OFF, opt-in
NETWORK).** Class-3 external links → `references` edges. `src/core/knowledge/references/web/`:
`GatedFetcher` applies layered, always-on guards (allowlist [empty ⇒ no fetch, the master
switch] → rejectlist → robots.txt → per-run `maxFetches` budget → timed `fetch` →
content-type [html only here; the `allowPdf` flag adds `application/pdf` for Phase-2 citation
fetch] → `maxBytes` → **LLM relevance pre-check** on
title/meta), staging passing bodies to `./temp`. `WebReferenceProcessor` (run per file in the
worklist when enabled) fetches each external link, extracts the page through the normal
reader+builder (depth-1, content only), and emits a `references` edge `citingDoc → url`
(`resolved:true`; gated/blocked ⇒ bare `resolved:false` + stub url node, never fabricated).
`FetchCacheService` (`<output>.fetch-cache.jsonl`, `CheckpointService`-style) makes a URL
fetched at most once across runs. Note: `extractBareUrls` is what captures web-clip
`> source:` URLs (markdown-link extraction alone misses them). Default run = offline,
byte-identical.

**Phase 2 — citation span-fetch + faithfulness (`references.citations.fetch`,
`--reference-citation-fetch`, default OFF, opt-in NETWORK).** The reference apex: a `cites`
edge stops dangling and becomes *evidence-bearing*. `src/core/knowledge/references/citations/`:
`CitationResolver` maps a cited work's id → OA full-text URL (arXiv→pdf · DOI→Unpaywall
`best_oa_location` [needs `unpaywallEmail`/`$UNPAYWALL_EMAIL`] · PMID→PMC), the PDF-capable
`GatedFetcher` (`allowPdf` → `application/pdf` accepted + staged as a binary `.pdf`, routed
through `PdfReader`) fetches it, and `CitationEvidenceProcessor` (run per file in the worklist,
the Phase-2 analog of `WebReferenceProcessor`) folds the fetched content onto the **same**
`document` node the `cites` edge names (`citationNodeName` reused from `ReferenceResolver`),
selects the span the citing claim relies on (exact → embedding cosine → fuzzy), and stamps the
edge. Its own `<output>.citation-cache.jsonl` (`FetchCacheService`) fetches each cited work at
most once. **When fetch is on, this processor OWNS `cites` edges — the Phase-0 resolver stands
down on citations** (`citationsForResolver = citations.enabled && !fetch.enabled`) so there's
exactly one `cites` edge per (doc, work); unresolved/gated ⇒ bare `resolved:false`, never
fabricated. Sub-layers, all gated, **graceful-degrade** independently:
- **2b GROBID** (`references.citations.grobid`, `--grobid`): a local GROBID service (Docker:
  `docker run -p 8070:8070 lfoppiano/grobid`) parses the citing PDF's TEI to link each in-text
  marker to its reference + the **citing sentence** (the claim). Regex over pdf2json can't
  recover that mapping (Dove's research). `GrobidClient` (cheerio xmlMode, no new dep)
  unreachable ⇒ falls back to regex id-bearing citations (no claim ⇒ no span/faithfulness).
- **2c MiniCheck** (`references.citations.fetch.minicheck`): `(citingClaim, span)` → 3-way
  `Relation.faithfulness` `supported`/`unsupported`/`uncertain` via the existing
  `MiniCheckGroundingChecker`, with an `uncertainBand:[lo,hi]` abstain zone (≤lo unsupported,
  ≥hi supported). Preserved through merge alongside `source`/`resolved` (+`faithfulnessScore`,
  `supportingSpan`).
- **2d title→id resolver** (`references.citations.titleResolver`, `--reference-title-resolver`):
  `TitleIdResolver` cascade Crossref → Semantic Scholar → OpenAlex (jaroWinkler title gate
  `minTitleSimilarity`) reaches the id-LESS majority; feeds `CitationResolver`.

Default run = offline, byte-identical. Gated GO by the OA-resolvability probe
(`examples/sandbox/oa-resolvability-probe.ts`); design in
`docs/inbox/2026-06-1{4-cheetah,5-dove}-*reference-resolution-phase2*`.

### 9. Debug run-trace (observability, `trace.enabled`, default OFF)

`src/core/trace/`: a module-singleton `trace` (à la `shared/shutdown`) emits a versioned
append-only JSONL sidecar (`<output>.trace.jsonl`) of every pipeline decision —
ingest · classify (+cascade tie-break) · extract (+mention IDs +token `usage`) · ground ·
merge/canon (+the adjudicator verdict) · export — `jq`/pandas-native. **Observe-only:** the
mention-instance lineage IDs live in a run-scoped `LineageRegistry` **outside** the graph
objects, so the serialized graph is byte-identical trace-on vs trace-off *by construction*.
Every emit is guarded by `if (trace.enabled)` (zero overhead off). The token-usage seam is the
optional `ILLMProvider.getLastUsage()` (both providers stash what they already log). Composes
with the future cost meter + debug inspector. Design: `docs/inbox/2026-06-15-dove-to-cheetah-debug-trace-layer-brief.md`.

## LLM Providers & Resume

### Provider selection

`provider` and `embeddingsProvider` (`ollama` | `openai`) are chosen independently in `ContainerFactory`:

| Option | Generation | Embeddings |
| ------ | ---------- | ---------- |
| Provider | `provider` | `embeddingsProvider` |
| Endpoint | `host` (base URL when `openai`) | `embeddingsHost` |
| API key | `apiKey` | `embeddingsApiKey` |
| Model | `model` | `embeddingsModel` |

Both keys fall back to `$OPENAI_API_KEY` / `$KG_API_KEY` if unset (so secrets needn't live in `config.yaml`). The `openai` provider works with any OpenAI-compatible endpoint (OpenAI, OpenRouter, Together, vLLM, Ollama Cloud). Default = local Ollama for both.

**To add a new provider**: implement `ILLMProvider` (and/or `IEmbeddingProvider`), then branch on it in the `TYPES.LLMService` / `TYPES.EmbeddingService` factories in `ContainerFactory.ts`.

### Resume / continuation

`--resume` (or `resume: true`) makes `KnowledgeGraphBuilder` checkpoint every chunk to a sidecar JSONL (`<output>.checkpoint.jsonl`, override with `--checkpoint`). The flag enables **both** write and read: start a long run with it, and if the run dies (credits exhausted, crash) just re-run the same command — already-processed chunks are restored from the checkpoint and skipped, no re-billing.

- Work-unit key = sha1 of `(pathRelativeToInput, chunkIndex, chunkContent, model, promptVersion)` — editing a file, changing chunk size (→ different content), switching models, or changing the prompt invalidates the affected entries. The path component is the file path **relative to `input`** (posix-normalized, computed in `KnowledgeGraphBuilder.stablePathId`), so **moving the whole input tree or changing the `input` prefix no longer invalidates resume** — only renaming an individual file *within* the tree re-runs that one file. Records also store `model`/`promptVersion` (and `relPath` for transparency) so `load()` reports how many match the current run and warns when none do (the usual reason "resume" appears to do nothing after a config change).
- Merge still runs once at the end over all per-chunk graphs (cross-file dedup can't be incremental), so resume saves the expensive extraction calls, not the final merge.
- `CheckpointService.load()` tolerates a truncated final line from an interrupted write.

**Graceful interrupt.** `src/shared/shutdown.ts` is a module-singleton flag. The CLI
(`process.command.ts`) wires SIGINT/SIGTERM/Ctrl+D to `shutdown.request()`; the file loop
(`DirectoryProcessor`) and chunk loop (`KnowledgeGraphBuilder`) poll `shutdown.isRequested()`
between units so the first interrupt finishes the in-flight chunk, checkpoints it, then
merges + exports the partial graph; a second interrupt force-quits.

**Retrieval scope.** `retrievalScope` (default `chunk`) controls whether
`DirectoryProcessor.buildRetriever()` retrieves context per chunk (using each chunk's own
content) or once per file from the first chunk (`file`, legacy). Entity embeddings are
cached by text, so per-chunk retrieval mostly reuses cached vectors.

## Key Conventions

- **TypeScript strict mode** — no implicit `any`; use explicit types
- **CommonJS modules** — imports compile to `require()` (no ESM)
- **Domain-appropriate entity naming** — snake_case for code/technical identifiers; original casing preserved for proper nouns (people, places, organizations)
- **Async/await throughout** — no callbacks, no `.then()` chains
- **Graceful error handling** — individual file failures return empty KG; processing continues for remaining files
- **Structured logging** — use injected `logger` (tslog), not `console.log`
- **Interface-first design** — all services have `I*.ts` interface files in `src/types/`
- **Provider-agnostic LLM layer** — generation and embeddings both go through interfaces (`ILLMProvider`, `IEmbeddingProvider`); backend is chosen in `ContainerFactory` from `provider`/`embeddingsProvider`

## Processing Pipeline

```plain
CLI args / config.yaml
    ↓
ContainerFactory.create(options) → DIContainer
    ↓
DirectoryProcessor.processDirectory()
    ↓
FileDiscoveryService.discover()          ← glob patterns
    ↓
[CorpusAnalyzer.analyzeOrLoad()]         ← --corpus-profiling enabled: term frequency + cached classification + 1 LLM glossary call (cached sidecar)
    ↓
For each file:                           ← [graceful interrupt checked between files]
  FileProcessor.processFile()            ← select reader → read → chunk → [classify]
  PromptManager.getSystemPrompt()        ← render Handlebars system template
  KnowledgeGraphBuilder.build()          ← per-chunk: [interrupt? finish+stop] → retrieve context for THIS chunk (retrievalScope) → [resume? skip if checkpointed] → render user prompt → LLM provider (Ollama | OpenAI-compatible) → Zod validate → [checkpoint append]
    ↓
KnowledgeMerger.merge()                  ← 3-level hierarchical merge
    ↓
KnowledgeGraphExportService.export()     ← json | jsonl | mcp-jsonl | dot
    ↓
Output file
```

### Corpus analysis pre-pass (`--corpus-profiling`, experimental, default off)

Before extraction, `CorpusAnalyzer` (`src/core/corpus/`) builds a corpus-global
`CorpusProfile` (cached to `<output>.corpus-profile.json`): it reads each file (char-capped),
counts term frequency (`countTerms`, pure — lowercased content words + capitalized
multiword proper-noun runs, stopword/number/short dropped), runs content classification
**once** (cached in `perFileClasses`, reused by `FileProcessor` so the classifier isn't
re-run per file), then makes **one** `ILLMProvider.generateStructured` call (rendered from
the `v5/glossary` templates) returning a `CorpusGlossary {entityNames, entityTypes,
relationTypes}`. Under v5 the glossary is **authoritative**, threaded two ways: (1)
`glossary.entityTypes`/`relationTypes` become the closed `entityTypeVocabulary`/
`relationTypeVocabulary` in the **system** prompt *and* union into the `buildGraphSchema`
Zod enums (`DirectoryProcessor` → `getSystemPrompt(…, glossary)` and
`KnowledgeGraphBuilder.build(…, glossary)`); (2) `glossary.entityNames` render as the
canonical-names block in `user.hbs`. Names are never enum'd, so new entities are still
discovered; the aim is consistent entity *naming* + a small controlled type/predicate vocab
up front, complementing the downstream Jaro-Winkler/embedding merge. Cached by a key over (sorted relpaths + model + topN + classifier); a stale key
rebuilds. Profiling is an enhancement — any failure (e.g. the glossary LLM emitting bad JSON)
is caught and the run continues without it. Flags: `--corpus-profiling disabled|enabled`,
`--corpus-top-terms` (100), `--corpus-profile-path`. `corpusClustering` is a v2 stub
(embedding clustering of terms, deferred). The glossary call uses `ILLMProvider` (honors the
`openai` provider), unlike `LlmContentClassifier` which still hits Ollama directly.

## File Readers (src/core/processor/readers/)

| Reader | Extensions | Library |
| ------ | ---------- | ------- |
| `TranscriptReader` | speaker-labeled `*.parakeet.txt`/`*.whisper.txt`/`*.corrected.txt`, transcript-shaped `.json` | Built-in (registered **first**; content-sniffing `canRead`) |
| `TextReader` | `.txt`, most text/code files | Built-in |
| `JsonFileReader` | `.json`, `.jsonl`, `.geojson` | Built-in (registered before `TextReader`) |
| `MarkdownReader` | `.md` | Built-in |
| `PdfReader` | `.pdf` (`pdfEngine: pdf2json`, default) | `pdf2json` |
| `MarkerPdfReader` | `.pdf` (`pdfEngine: marker`) | `marker_single` CLI (Python; optional `--use_llm`) |
| `MistralOcrReader` | `.pdf` (`pdfEngine: mistral`) | Mistral OCR HTTP API (native fetch) |
| `DoclingReader` | `.pdf` (`pdfEngine: docling`); also `.doc`/`.ppt` | Docling CLI (opt-in) |
| `HtmlReader` | `.html`, `.htm` | `cheerio` + `html-to-text` |
| `OfficeReader` | `.docx`, `.xlsx`, `.pptx` | `officeparser` |
| `RtfReader` | `.rtf` | `rtf-parser` |
| `ImageReader` | `.jpg`, `.png`, `.gif`, `.webp`, etc. | Vision model via Ollama |
| `AudioReader` | `.mp3`, `.wav`, `.ogg`, `.m4a`, etc. | `whisper` engine (`nodejs-whisper`) or `dual` engine (Python `audio-pipeline`: VAD + Parakeet/Whisper dual-STT + diarization) |
| `BinaryReader` | Unknown/binary | Skips gracefully |

**TranscriptReader** (`src/core/processor/readers/TranscriptReader.ts`) is registered **before** `JsonFileReader`/`TextReader` and overrides `canRead` to claim only files that sniff as transcripts (deferring everything else). It normalizes three real shapes — recua speaker-labeled text (`SPEAKER_XX:` blocks), recua turns JSON (`[{start,end,speaker,<backend>}]`), and Claude/ChatGPT chat exports (`[{chat_messages:[{sender,created_at,…}]}]`) — into `Turn[]`, then **size-packs** them into chunks capped at `maxChunkSize` (tied to the global `chunkSize` via `ContainerFactory`), rendering each turn inline as `speaker: text`. A turn longer than the budget is split with its label kept on every piece. `ChunkProvenance {source, occurredAt}` is always set; `speaker` is set **only when a chunk is single-speaker** (mixed chunks keep the speaker labels inline in the content instead). This keeps a long dialogue to a handful of chunks (was one-per-turn → an LLM call per turn, the `--chunk-size`-ignored explosion). Inline labels keep speakers visible to the model as dialogue provenance without each `SPEAKER_XX` becoming an entity.

**JsonFileReader** (`src/core/processor/readers/JsonFileReader.ts`) is registered **before** `TextReader` in `ContainerFactory` (first-match-wins) so it claims `.json`/`.jsonl`/`.geojson`. It re-serializes JSON compactly (token savings) and chunks on structure — top-level array elements, an object's dominant array (e.g. `{conversations:[…]}`, header of sibling keys preserved), or JSONL lines — packing to `jsonReader.maxChunkSize` (default = global `chunkSize`) and recursing one level into oversized elements. Malformed JSON falls back to raw text chunking (never throws). Config: `--json-strategy structural|raw` + nested `jsonReader: { strategy, maxChunkSize }`.

## LLM Integration Details

Both backends implement `ILLMProvider.generateStructured<T>()` (zod → JSON schema, parse, strip code blocks, zod-validate, retry 3× with backoff, empty graph on permanent failure):

- **`OllamaService`** — sends to Ollama with the `format` constraint.
- **`OpenAICompatibleService`** — `chat.completions.create` with `response_format: json_schema` (`strict: false`); on a provider/model that rejects json_schema it falls back to `json_object` + schema-in-prompt (handles Gemma-style endpoints). `host` is the base URL, `apiKey` the bearer token. No model-introspection endpoint, so `getModelCapabilities()` returns `[]` (vision is attached on faith when `--images` is on).
- **Output truncation.** Both services pass `maxTokens` (`--max-tokens` → OpenAI `max_tokens` / Ollama `num_predict`) when set, and warn on a `length` finish/done reason — the common cause of `SyntaxError` JSON parse failures on huge chunks is the model running out of output budget. Fix by raising `--max-tokens` or lowering `--chunk-size`.

**Embeddings** — `IEmbeddingProvider` (`embed`/`embedBatch`, in-memory cache):

- **`EmbeddingService`** — Ollama, batches of 10.
- **`OpenAIEmbeddingService`** — OpenAI-compatible, native array batching (100/req) to cut request count.
- Both truncate inputs to `embeddingsMaxInputChars` (default 1024) before the API call, and **adaptively halve + retry** if the model still rejects the input as too long (see `embeddingUtils.ts`), so long observations/entities/JSON chunks can't overflow the embedding model's context.
- Used for observation deduplication and context retrieval. Chosen independently from generation, so cloud generation + free local embeddings is the default.

## Testing

There is an active Jest suite — run it with `npm test` (or `npx jest`). It is network-free: the LLM provider is always mocked, so no Ollama/API dependency in CI.

When writing new tests:

- Place files as `*.test.ts` next to source or in `__tests__/` directories
- Mock the LLM provider to avoid an Ollama/network dependency in CI — depend on `ILLMProvider` and inject a stub (the builder takes `llmService: ILLMProvider`)
- Quality metrics live in `src/quality/` (structural, semantic, factual, consistency, composite) — importable from `src/`
- `src/evaluation/` contains the benchmark harness (datasets, matching, metrics, reporters); run via `npm run benchmark` (the original `test/` evaluators were removed in favor of these)

## Common Tasks

### Add a new file reader

1. Create `src/core/processor/readers/MyReader.ts` extending `FileReader`
2. Implement `read(filePath: string): Promise<FileReadResult>`
3. Register in `FileReaderFactory.ts` with associated extensions

### Add a new export format

1. Create `src/core/export/strategies/MyExportStrategy.ts` implementing `IExportStrategy`
2. Register in `KnowledgeGraphExportService.ts`
3. Add format value to `ExportFormat` type in `ProcessingOptions.ts`
4. Add CLI option handling in `src/cli/index.ts`

### Add a new service

1. Define interface in `src/types/IMyService.ts`
2. Implement in `src/core/.../MyService.ts`
3. Add a Symbol to the `TYPES` map in `ContainerFactory.ts`: `MyService: Symbol.for('MyService')`
4. Register in `ContainerFactory.ts`

### Modify prompt templates

Templates are in `src/core/llm/prompts/templates/v5/` (current default):

- `system.hbs` — system prompt with context (directory tree, description, examples)
- `user.hbs` — per-chunk user prompt (file path, chunk info, retrieved context, content)
- `partials/` — reusable Handlebars partials
- `partials/examples/` — domain-specific extraction examples

### Run against a real project (local Ollama)

```bash
cat > config.yaml << 'EOF'
input: /path/to/project
filter: ["**/*.ts", "**/*.md"]
exclude: ["**/node_modules/**", "**/dist/**"]
output: ./kg-output.jsonl
llm:
  model: gemma3:4b
export:
  format: jsonl
logging:
  level: debug
EOF

npx ts-node ./src/index.ts --config config.yaml
```

### Run against a cloud provider, resumably (OpenRouter + local embeddings)

```bash
cat > config.yaml << 'EOF'
input: /path/to/claude-chats-export
filter: ["**/*.json"]
output: ./kg-output.jsonl
export:
  format: jsonl

# Generation on OpenRouter (host = base URL); key can also come from $OPENAI_API_KEY
llm:
  provider: openai
  host: https://openrouter.ai/api/v1
  apiKey: sk-or-...
  model: google/gemma-3-27b-it

# Embeddings stay local & free (default), so dedup/merge costs nothing
embeddings:
  provider: ollama
  model: mxbai-embed-large:335m

resume:
  enabled: true   # writes <output>.checkpoint.jsonl; re-run the same command to continue
EOF

npx ts-node ./src/index.ts --config config.yaml
# If credits run out mid-run, just re-run — already-processed chunks are skipped.
```

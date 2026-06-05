# Development Roadmap

## ✅ Phase 1: Core Pipeline (Complete)

- [x] Core CLI interface (Commander.js, 40+ options, YAML/JSON config file support)
- [x] Multi-format file reading: text, Markdown, PDF, Office (.docx/.xlsx/.pptx), HTML, RTF, images, audio/video
- [x] Smart text chunking (`RecursiveCharacterTextSplitter` with configurable overlap)
- [x] 3-level hierarchical merging: within-chunk → within-file → cross-file
- [x] MCP compatibility layer (`mcp-jsonl` export format)
- [x] Quality evaluation framework (`/test/` directory — not automated tests)
- [x] Context-aware processing (retrieval-augmented prompting with existing KG)
- [x] Multi-modal KG generation (Whisper ASR for audio/video, vision model for images)
- [x] Multiple export formats: `json`, `jsonl`, `mcp-jsonl`, GraphViz `dot`
- [x] Watch mode (real-time KG updates via chokidar)
- [x] Dependency injection system (`DIContainer` + `ContainerFactory`)
- [x] Versioned prompt templates (v1–v5, Handlebars-based with domain example partials)
- [x] In-memory embeddings caching (`EmbeddingService`)
- [x] Graphviz DOT export with configurable layout, color scheme, clustering options
- [x] Docling integration for advanced PDF/Office parsing

## ✅ Phase 2: Document Classification & Prompt Routing (Complete)

- [x] **`HeuristicContentClassifier`** — rule-based classification (extension 40% + path 30% + content 30%)
- [x] **`BertContentClassifier`** — BERT-based classification via `@huggingface/transformers`
- [x] **`LlmContentClassifier`** — LLM-based classification using Ollama (model-configurable via `--model`)
- [x] **12 content classes** defined in `CONTENT_CLASSES.ts` (code, financial, medical, legal, research, transcript, tabular, communication, documentation, technical, narrative, reference)
- [x] **NER domain examples** in `NER_DOMAIN_EXAMPLES.ts`
- [x] **Domain-specific prompt partials** (article, code, legal, medical, financial, osint, transcript, tabular, notes, logs, generic)
- [x] **Expose `--classifier` flag in CLI** (`disabled` | `heuristic` | `llm` | `bert`)
- [x] **Prompt routing per document class** — domain example partial injected into system prompt based on detected type
- [x] **Context-aware prompt enhancement** — domain hints (entity/relation types) injected into user prompt with confidence score
- [x] **Fallback mechanism** for low-confidence classifications (threshold: 0.3 — below this, no domain injection)
- [x] **Mixed domain handling** — top-2 classes within 0.2 confidence delta → combined entity/relation type hints

### Remaining

- [x] **Measure classification accuracy** using external benchmarks (REBEL, CrossRE)
- [x] **Evaluate prompt routing effectiveness** — ablation via `npm run benchmark -- --classifier disabled/heuristic`

## 🔬 Phase 3: Testing & Quality Control

### Quality Framework

- [x] **`StructuralMetrics.ts`** — entity/relation counts, graph density, connectivity
- [x] **`SemanticMetrics.ts`** — entity name quality, observation specificity, domain coverage
- [x] **`FactualMetrics.ts`** — hallucination detection, source grounding, factual consistency
- [x] **`ConsistencyMetrics.ts`** — cross-file consistency, type consistency
- [x] **`CompositeScore.ts`** — 0–100 overall quality scoring with recommendations
- [x] **Benchmark harness** (`src/evaluation/` + `scripts/benchmark.ts`) — external P/R/F1 against REBEL and CrossRE datasets; exact + semantic matching via `EmbeddingService`
- [x] **CrossRE dataset integration** — 12 domain-split files downloaded to `data/crossre/crossre_data/`; parser corrected to tuple format
- [x] **Intrinsic quality metric fixes** — eliminated vacuous-truth inflation (empty KG no longer scores ~74/100); fixed `connectedComponents` guard, all `return 1.0` → `return 0` for absent data
- [x] **Prompt template consistency** — aligned "Previously Identified Context" → "Existing Knowledge Context" in user.hbs; fixed snake_case lock-on in system.hbs; added format-note to examples

### Benchmark Findings (CrossRE news, n=10, mxbai-embed-large, threshold=0.5)

| Model | Sem Entity F1 | Sem Relation F1 | Sem Triple F1 | Intrinsic |
| ----- | ------------- | --------------- | ------------- | --------- |
| gemma3:12b | 0.846 | 0.579 | 0.421 | 79.3 |
| gemma3:4b | 0.754 | 0.471 | 0.314 | 78.2 |
| gemma3:1b | 0.636 | 0.537 | 0.390 | 77.7 |
| qwen3:8b | 0.807 | 0.361 | 0.278 | 76.9 |
| qwen2.5:1.5b | 0.558 | 0.471 | 0.353 | 73.5 |
| Thinking-Camel-7b Q4 | 0.605 | 0.516 | 0.452 | 69.1 |
| qwen3:4b | **0 (no relations extracted)** | 0 | 0 | ~~74~~ → **0** (fixed) |

**Key findings:**

- Exact relation/triple F1 is always 0 — expected, kg-gen uses open-ended labels vs CrossRE's 17-label taxonomy
- Semantic relation matching at threshold=0.5 gives meaningful signal (0.35–0.58)
- Models that extract entities but zero relations can inflate intrinsic quality — now correctly scored as 0
- Sem Triple F1 ≈ Sem Relation F1 because predicate matching is the bottleneck (entities match well at 0.6–0.85)
- Vocabulary lock-on: system prompt `snake_case` instruction caused entities like `united_arab_emirates` instead of `United Arab Emirates` — fixed

### Testing Remaining

- [ ] **Set up Jest testing framework** (`jest` + `ts-jest` installed, no test files yet)
- [ ] **Unit tests** for core services: `TextChunker`, `KnowledgeMerger`, `OllamaService`, `EmbeddingService`
- [ ] **Integration tests** for end-to-end processing flows
- [ ] **Mock LLM responses** for deterministic testing (avoid Ollama dependency in CI)
- [ ] **Test coverage reporting**
- [ ] **File-based embeddings cache** (persistent across runs, currently lost on exit)
- [ ] **Automated entity/observation validation** post-extraction
- [ ] **Automated hallucination detection** system
- [ ] **Graph consistency checker** (cross-file entity naming validation)

## Phase 4: Vector Database Integration

- [ ] ChromaDB integration for semantic search
- [ ] Neo4j graph database support
- [ ] Incremental updates (only reprocess changed files)
- [ ] Incremental indexing for large codebases
- [ ] Hybrid search (vector + metadata filters)
- [ ] Support for real-time file watcher + incremental graph updates

## Phase 5: Advanced Retrieval

- [ ] Cross-encoder reranking models
- [ ] Quality-aware context selection
- [ ] Neo4j integration for graph traversal queries
- [ ] Hybrid vector + graph search

## Phase 6: Production Features

- [ ] Persistent LRU embeddings cache (file-based, survives restarts)
- [ ] Performance monitoring and metrics dashboard
- [ ] LoRa fine-tuning dataset generation from quality-scored graphs
- [ ] Advanced CLI features (batch processing, parallel workers, progress bars)
- [ ] npm package publication (`kg-gen` binary)

## Research Goals

- [ ] **BERT Document Classification**: Train BERT on auto-generated labels if heuristics prove insufficient
- [ ] **LoRa fine-tuning adapters** for domain-specific knowledge extraction
- [ ] **Custom KBLaM implementation** for knowledge-based language modeling
- [ ] **Comparative analysis** with other KG extraction methods
- [ ] **Domain-specific prompt optimization** based on classification accuracy results
- [ ] **Multi-modal knowledge graphs** with document type awareness (text + image + audio entities)
- [ ] **LLM leaderboard** with quantitative benchmarks across models and document types

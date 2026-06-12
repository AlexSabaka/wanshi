# Tech debt

Known shortcuts and rough edges, logged rather than hidden. Add an item when you
take a shortcut or spot existing debt outside your task's scope. Keep entries
short and link the file. Remove an item when it's paid down.

## Open

- **Canon should not embed with embeddinggemma — switch to nomic + recalibrate.**
  The separation bench (`examples/sandbox/embedding-bench.ts`, note
  `docs/inbox/2026-06-12-cheetah-embedding-model-bench.md`) found embeddinggemma *sub-random*
  at separating co-referents from sibling homonyms on the live mixed corpus (AUC 0.385,
  negative d′). `nomic-embed-text` (raw, no prefix) is the robust pick. Point canon's
  `embeddings.model` at it and recalibrate the threshold — embeddinggemma's 0.92 does **not**
  transfer. Investigation done; the switch is not applied.

- **Canon adjudication count is bounded but unmeasured live.** Phase 4 bounds it structurally
  (`canonicalization.blockTopN` + `maxAdjudications` cap, `src/core/knowledge/canon/Canonicalizer.ts`),
  but a live `method: hybrid` run hasn't confirmed it lands in the low hundreds (vs the NR-3
  26,565-call blowup). Confirm on a real run before trusting the bound.

- **Co-occurrence edge gate drops concept edges (KG-12b).** `GroundingTransform`
  (`src/core/pipeline/GroundingTransform.ts`) tests `span.includes(snake_case_name)`, but
  concept names never appear verbatim in the raw span → it mass-drops legitimate edges. Needs
  surface-form/alias retention through extraction+canon. OFF by default (Experiment-2 gate), so
  low urgency until that path is used.

- **Dual-model canon embedding override + domain→model routing (deferred).** Phase-4 WI4:
  a `pipeline.canonicalization.embeddingModel` so canon can cluster on a different model than
  generation/merge-dedup. Related: the bench showed model quality is domain-dependent at the
  extremes, but a generalist (nomic) sufficed — a domain→embedding-model *mapper* (and
  domain-specific models like FinBERT) only earns its complexity if a deployment spans domains
  no single model covers. Backlog.

- **Complete-linkage canon is O(n³) without blocking.** `completeLinkageCluster`
  (`src/shared/utils/agglomerativeCluster.ts`) is naive greedy re-scan; `blockTopN` bounds the
  candidate set but defaults off, so a large graph with blocking disabled could be slow.

- **`npm test` doesn't run the suite.** The `test` script points at a hardcoded
  personal config path; the real Jest suite runs via `npx jest`. Point `test` at
  Jest.

- **Dead code in domain examples.** The `examples` array per domain in
  `src/core/processor/classifier/NER_DOMAIN_EXAMPLES.ts` is never read
  (`buildDomainHints()` only uses `primaryEntityTypes`/`primaryRelationTypes`).
  Remove it or wire it in.

- **`corpus.clustering` is a stub.** The flag is accepted and validated but
  ignored (logged as not-implemented in `CorpusAnalyzer`). Either implement the
  v2 embedding-clustering pass or drop the flag.

- **`document-outline-gen` is pinned to a commit, not a semver tag.** `package.json` pins the
  1.0.0 merge commit (`git+https://…#0adcc09…`) because the repo has **no git tags** yet (only
  `master` + `features/peggyjs`). Once outline-gen tags `1.0`/`v1.0`, switch the pin to
  `github:AlexSabaka/document-outline-gen#semver:^1.0` so kg-gen tracks patch/minor releases without
  re-pinning a SHA. (Transport is `git+https` so sandbox/CI installs work without an ssh key.)

- **Outline Phase-8 Symbol API is available but unused.** The rebuilt outline-gen now exports a
  deterministic Symbol API (`extractSymbols`/`extractSymbolsSafe`, `SYMBOL_KINDS`,
  `SYMBOL_TABLE_JSON_SCHEMA`, `hashContent`) purpose-built to seed kg-gen's own roadmap **Phase 8**
  (AST-seeded code extraction). When that phase lands, its `kind` enum must map **1:1 into the
  Phase-2 type vocabulary, not fork** — read kg-gen's entity-type taxonomy first and design the
  mapping to fit. Not wired this pass (it's Phase-8 scope).

- **Frontend needs a built backend.** The web UI fetches the config schema by
  spawning `kg-gen schema` (`frontend/app/api/config-schema/route.ts`); it can't
  import backend `src/` (separate package). Requires `npm run build` (or
  `KG_GEN_CMD`) before the run form renders.

## Paid down

- **KG-09 — KBLaM/LoRA exports collided on a constant `fact` key.** Both exports emitted every
  observation as property `"fact"`, so an entity's N facts shared one key (KBLaM rectangular-attention
  averaging / contradictory SFT signal). Both now build on a shared `toKbTriples`
  (`src/core/export/strategies/kbTriples.ts`) that aggregates observations into one `description`
  property and keys relations on their predicate (same-predicate targets joined), guaranteeing a
  unique `(name, property)` per entry; KBLaM `key_string` aligned to the paper's `"The {property} of
  {name}"` (capital T). LoRA filters ungrounded facts before aggregation.

- **Phase 6 — data-model integrity (KG-07/10/11/13).**
  - **KG-13 entity identity + type election + files[] union.** Global merge now keys file/document
    artifacts by name+file (disambiguating colliding `package.json` rather than overwriting one — the
    reverted WI6 data loss), re-keys relations per-graph, elects entityType by vote (specific beats
    `other`), and writes back the cross-file `files[]` union (`KnowledgeMerger.ts`). Conceptual
    same-name entities still merge cross-file.
  - **KG-10 bi-temporal + conversation boundaries.** `parseChatExport` splits on conversation
    boundaries (no cross-conversation chunk; per-conversation `validAt`, `TranscriptReader.ts`).
    Merge-time supersession (`merging.supersession: heuristic|llm`) now writes `invalidAt`/`expiredAt`
    on an older contradicted fact instead of deleting it (Graphiti model), via the new
    `IContradictionChecker` seam (`src/core/knowledge/contradiction/`). `validAt` is stamped from the
    source's `occurredAt`, never the ingestion time.
  - **KG-07 checkpoint key.** `KnowledgeGraphBuilder` folds glossary + classifier classes + retrieved
    context + system-prompt (resolved vocab/schema) + grounding into the checkpoint key's `extra`, so
    toggling any extraction-affecting input between `--resume` runs re-extracts the affected chunks.
  - **KG-11 JSONL retrieval seeding.** `JsonlExportStrategy.fromJSONL` implemented and `loadPriorGraphs`
    routes jsonl/mcp-jsonl line-by-line, so the README-recommended jsonl output round-trips without the
    per-run warning.

- **Outline warnings on plain text + duplicated renderer (KG-17).** After pinning the rebuilt
  `document-outline-gen` (1.0.0), `generateOutlineFromContent` (`src/shared/utils/documentOutline.ts`)
  now calls upstream `generateFromContentSafe` (returns `[]` for unknown extensions / parse failures
  instead of throwing a `No generator found` warning per chunk) and renders via upstream
  `formatOutline(outline, "ascii-tree", { compact })` — kg-gen's byte-identical `formatAsTree`/
  `formatMetadata` copies were deleted (single source of truth). The new token-lean `compact` mode is
  threaded through `readers.outline.compact`. Newly covered extensions (Go/Rust/Swift/Kotlin, TOML/INI,
  RST/LaTeX/Org, …) now produce real outlines instead of warning.

- **Logger level mapping is off.** Fixed in Phase 1 (KG-19): `LoggerFactory.createLogger`
  now maps `logging.level` onto tslog's real scale (silly=0 … fatal=6) and `--silent`
  suppresses warn/error. (`src/shared/logger/LoggerFactory.ts`).

- **Prompt base-vocabulary is duplicated.** Mitigated in Phase 2 (KG-05): `BASE_ENTITY_TYPES`/
  `BASE_RELATION_TYPES` now live in one place (`src/core/knowledge/vocabulary.ts`), and
  `vocabulary.test.ts` asserts the v5 `system.hbs` `{{else}}` lists equal them — so they can no
  longer drift *silently* (drift fails CI). The template list is still hand-maintained rather
  than rendered from the constant, but the actionable risk is closed.

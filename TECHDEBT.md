# Tech debt

Known shortcuts and rough edges, logged rather than hidden. Add an item when you
take a shortcut or spot existing debt outside your task's scope. Keep entries
short and link the file. Remove an item when it's paid down.

## Open

- **Entity identity is name-only — same-basename files fuse (KG-13 / Phase-4 WI6).**
  `KnowledgeMerger` keys entities by `name` and relations reference by `name`, so two
  distinct entities sharing a basename (`package.json`, `index.ts` — one per project)
  can't coexist: the exact-match path fuses them, and *not* merging them just makes the
  name-keyed map overwrite one (data loss — found while attempting WI6, reverted). A real
  fix needs identity = name+file and relation re-keying by qualified id. Bundle with the
  rest of KG-13: restore the cross-file `files[]` union (computed in `mergeGlobally` then
  discarded, `src/core/knowledge/merging/KnowledgeMerger.ts:497`) and fix
  entityType election (currently longest-string wins, so `other` beats `file`). → Phase 6.

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

- **`document-outline-gen` rebuilt branch not merged — kg-gen wiring upgrades blocked.**
  The dependency was rebuilt (tree-sitter WASM engine, 45 exts / 11 formats, a `formatOutline`
  layer, `generateFromContentSafe`, a `compact` ascii-tree mode) but it sits **unpushed** on
  `feat/wasm-engine-phase-0-1`; kg-gen's installed copy is the old commit `9dc67c5` (`generateFromContent`/
  `generateFromFile` only, no Safe/`formatOutline`). Once Sabaka pushes + merges to master, do the
  wiring (`docs/inbox/2026-06-12-from-cheetah-outline-gen-wiring.md`): swap the local guard for
  upstream `generateFromContentSafe`; delete kg-gen's `formatAsTree`/`formatMetadata`
  (`src/shared/utils/documentOutline.ts`) in favor of `formatOutline`; thread a `compact` option
  through `readers.outline`; and pin `#semver:^1.x` instead of tracking master. Separately, outline-gen
  **Phase 8** adds a deterministic Symbol API to seed kg-gen's own Phase 8 — its `kind` enum must map
  1:1 into the Phase-2 type vocabulary, not fork; bring kg-gen's kind list to that planning session.

- **Frontend needs a built backend.** The web UI fetches the config schema by
  spawning `kg-gen schema` (`frontend/app/api/config-schema/route.ts`); it can't
  import backend `src/` (separate package). Requires `npm run build` (or
  `KG_GEN_CMD`) before the run form renders.

## Paid down

- **Outline warnings on plain text.** `generateOutlineFromContent`
  (`src/shared/utils/documentOutline.ts`) now guards on the generator's `isSupported(extension)`
  and returns `""` for unhandled extensions (e.g. `.txt`) instead of letting `generateFromContent`
  throw a `No generator found` warning per chunk (KG-17). Local stand-in for the upstream
  `generateFromContentSafe` until the rebuilt `document-outline-gen` is merged (see the Open item).

- **Logger level mapping is off.** Fixed in Phase 1 (KG-19): `LoggerFactory.createLogger`
  now maps `logging.level` onto tslog's real scale (silly=0 … fatal=6) and `--silent`
  suppresses warn/error. (`src/shared/logger/LoggerFactory.ts`).

- **Prompt base-vocabulary is duplicated.** Mitigated in Phase 2 (KG-05): `BASE_ENTITY_TYPES`/
  `BASE_RELATION_TYPES` now live in one place (`src/core/knowledge/vocabulary.ts`), and
  `vocabulary.test.ts` asserts the v5 `system.hbs` `{{else}}` lists equal them — so they can no
  longer drift *silently* (drift fails CI). The template list is still hand-maintained rather
  than rendered from the constant, but the actionable risk is closed.

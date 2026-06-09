# Tech debt

Known shortcuts and rough edges, logged rather than hidden. Add an item when you
take a shortcut or spot existing debt outside your task's scope. Keep entries
short and link the file. Remove an item when it's paid down.

## Open

- **Prompt base-vocabulary is duplicated.** `BASE_ENTITY_TYPES` /
  `BASE_RELATION_TYPES` in `src/core/knowledge/KnowledgeGraphBuilder.ts` must be
  kept in sync by hand with the `{{else}}` base lists in
  `src/core/llm/prompts/templates/v5/system.hbs`. Render the template list from
  the constant (or share one source) so they can't drift.

- **Logger level mapping is off.** `LoggerFactory.createLogger`
  (`src/shared/logger/LoggerFactory.ts`) maps `logging.level` to tslog `minLevel`
  with numbers (`debug→0, info→1, warning→2, error→3`) that don't match tslog's
  actual level scale, so e.g. `logging.level: warning` still prints info/debug.
  Map to tslog's real level numbers.

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

- **Outline warnings on plain text.** Files without a known generator (e.g.
  `.txt`) log `Cannot generate document outline … No generator found for file
  extension` on every chunk. Cosmetic, but noisy — gate the warning by
  `readers.outline.enabled` / known extensions.

- **Frontend needs a built backend.** The web UI fetches the config schema by
  spawning `kg-gen schema` (`frontend/app/api/config-schema/route.ts`); it can't
  import backend `src/` (separate package). Requires `npm run build` (or
  `KG_GEN_CMD`) before the run form renders.

## Paid down

(empty — move resolved items here with a one-line note, or just delete them)

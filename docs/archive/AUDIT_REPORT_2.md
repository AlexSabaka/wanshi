# wanshi — Re-Audit (v2): verify the fixes, audit the new surface

**Auditor:** Cheetah 🐆 (independent re-audit, "guilty until proven not")
**Date:** 2026-06-24 · repo `/Volumes/2TB/wanshi-kg/wanshi` @ `e698e69` (branch `frontend-provenance`; continuous history from the v1-audited `892d317` — 175 commits, 469 files, +62.6k/−2.4k). Working tree has uncommitted timeline-frontend + audio-pipeline lockfile changes (out of scope).
**Predecessor:** `AUDIT_REPORT.md` (v1, @ `892d317`, 2026-06-10), preserved as history; the project archived its own copy at `docs/archive/AUDIT_REPORT.md`.
**Method:** Phases A–F per the v1 brief, adapted to a re-audit: **Track 1** re-verifies each of KG-01…KG-19 with a falsification test (assess → independent refute); **Track 2** hunts the new TypeScript subsystems (find → adversarial verify). Both ran as adversarial multi-agent workflows (38 + 80 agents). Reconciliation docs (`TECHDEBT.md`, `docs/PROJECT_STATE.md`, `ROADMAP.md`, `docs/inbox/*`) were quarantined until Phase E. **Scope:** core TS pipeline + new TS subsystems. **Out:** Python `audio-pipeline/`/`doc-classifier/` internals, `frontend/`/`website/`.
**Test baseline at audit time:** `npx jest` → **83 suites / 465 tests, all passing** (was 19/88 at v1). A green suite is a health signal, not proof of a fix — several confirmed bugs below (e.g. a documented feature that never runs) pass the suite cleanly.

Confidence labels: `[CONFIRMED]` = read the code/artifact or reproduced; `[INFERRED]` = reasoned, gap stated; `[UNVERIFIED]` = could not check, reason stated. Locations are relative to repo root.

---

## TL;DR

The June sprint did **genuinely good work**: of 19 prior findings, **11 are fully fixed** (KG-01/02/03/06/09/10/12/15/16/19 — each empirically reproduced), **8 are PARTIAL** (the residual is real and located), and **0 are still-broken or regressed**. The headline crit/high bugs (dead ASR, failed-chunk checkpointing, ignored sampling params, glossary validation, KBLaM/LoRA key collision) are closed cleanly.

But "guilty until proven not" earned its keep, and the re-audit surfaces a sharper story than "all 19 fixed":

1. **Two "Paid down" claims overclaim.** TECHDEBT lists **KG-07** and **KG-11** as paid; both are **PARTIAL**. KG-11's `loadPriorGraphs` still reads the wrong filename, so jsonl cross-run seeding is *still dead in the default config* — and it's the *same* `getOutputPath` root cause the project separately logged as open debt.
2. **The bug *patterns* propagated into new code even though the *instances* were fixed.** The KG-02/KG-06 "cache-the-failure" anti-pattern reappears in **3 new subsystems**; the KG-11 sidecar-path-rewrite class reappears in trace/cost; KG-13's homonym over-merge survives for `config`-typed file artifacts.
3. **A documented feature is silently dead.** `pipeline.relationFilter` (the `related_to` pruning gate, "~30% of edges on prose corpora") is registered and enable-able but its stage token is missing from `DEFAULT_STAGES`, so `PipelineRunner` never invokes it. Net-new, found independently by two agents, fix = one array entry.
4. **Trust gates fail open.** C2PA marks tampered/untrusted manifests *valid*; the MiniCheck keyword pre-filter accepts edges whose endpoints aren't in the source; the web-fetch allowlist is prefix-bypassable + follows redirects without re-validation (SSRF).
5. **The eval harness can silently lie.** A CrossRE loader bug collapses every finite-`--limit` multi-domain run to a single domain — every such leaderboard number compares one domain, not six. For a project that *is* a research platform, a wrong scorer poisons the conclusions drawn from it.
6. **KG-14 (the plaintext OpenRouter key) is still live** — same token, unrotated, now in **three** files. Rotate it.
7. **The README oversells default-off gates.** Grounding (`mode:disabled`), supersession (`disabled`), canonicalization (`enabled:false`) all ship off; `PROJECT_STATE.md` is honest ("Real (opt-in)"), but the README's *"It won't record what it can't verify against the source"* is false in a default run.

**63 new located findings** (14 high / 16 med / 33 low after merging one duplicate), all adversarially verified (5 further candidates were correctly refuted).

---

## Phase A — What the code is now, and the docs-vs-code delta

wanshi is the continuous evolution of kg-gen: same glob→reader→chunk→corpus-glossary→per-chunk LLM extraction (Zod closed enums)→grounding gate→checkpoint→3-level merge→post-merge transforms→export pipeline, now with a `PipelineRunner` driving the **post-merge** graph→graph transforms (`grounding`, `canonicalization`) ordered by `config.pipeline.stages` (producers still run in `DirectoryProcessor`). Major new surface since v1: a **citation-faithfulness** pipeline (GROBID + gated web fetch + MiniCheck), **image EXIF/C2PA/CV** object detection, a **SQLite structured adapter** (deterministic, no-LLM), a **cascade classifier**, **AST symbol seeding** (tree-sitter via `document-outline-gen`), an **evaluation harness** (MINE/SemEval/CrossRE/RedocRED), a **cost meter**, a **trace/lineage** layer, **6 PDF engines**, **dual ASR**, and **6 new readers** (Email/Chat/Subtitle/LaTeX/EPUB/Jupyter). Data model gained `Relation.{resolved,faithfulness,faithfulnessScore,supportingSpan}` and `Observation.{sourceAdapter,locator,confidence}`. Package renamed `@wanshi-kg/wanshi@0.1.0`, published to npm.

**Docs-vs-code delta** (README claims vs code; `PROJECT_STATE.md` is largely accurate and self-corrects most of these — the gap is the README):

| Claim (README) | Reality |
|---|---|
| "It won't record what it can't verify against the source" (grounding) | **Gate is `mode:disabled` by default** (`config/schema.ts` `GroundingSchema`); even when on, `checker` defaults to `keyword` (KG-08 heuristic), MiniCheck is opt-in. `PROJECT_STATE.md` correctly says "Real (opt-in)"; the README sentence is unconditional and false by default. |
| Bi-temporal axis `validAt`/`invalidAt` as a headline | `invalidAt`/`expiredAt` are only written by **merge-time supersession**, which is `default("disabled")` (`SupersessionModeEnum`). A default run produces write-once data. Mechanism is real (KG-10 fixed); it's just off. |
| "a SQLite `.db` becomes tables→types, rows→entities, foreign-keys→edges with no LLM" | Deterministic, yes — but **composite FKs fabricate wrong edges, implicit-PK FKs silently drop all edges, composite PKs collapse distinct rows** (WS-06/07/08). TECHDEBT logs composite-PK/junction as "deferred"; the README presents it as a working feature. |
| "~22 readers" / multi-format | Real, but the 6 new readers are "shipped, not live-validated" (TECHDEBT) and carry concrete parse bugs (WS-M/L, new-readers). |
| `pipeline.relationFilter` (`related_to` pruning, config-documented) | **Never runs** — stage token absent from `DEFAULT_STAGES` (WS-H14). |
| `--max-cost` budget ceiling | **Fails open for unpriced models** — unlimited spend, info-level note only (WS-H13). |

---

## Part 1 — Regression matrix (KG-01 … KG-19)

| ID | Area | Status | Conf | Current location | One-line verdict |
|---|---|---|---|---|---|
| KG-01 | readers/ASR | **FIXED** | CONFIRMED | `FileReader.ts:57`, `TextReader.ts:11-58`, `BinaryReader.ts:32`, `ContainerFactory.ts:504-539` | Exact-match routing; `.mp3`→AudioReader (ASR default-on, Whisper reachable) or →BinaryReader-skip (ASR off). Repro'd both branches; never mojibake. |
| KG-02 | checkpoint | **FIXED** | CONFIRMED | `KnowledgeGraphBuilder.ts:432-451,834-868`; `DirectoryProcessor.ts:394-407` | `generateKnowledgeGraph` has no try/catch; failures land in `buildChunk` catch → `failedChunks` (never checkpointed) → `exitCode=1`. Empty-vs-failed split holds. |
| KG-03 | llm | **FIXED** | CONFIRMED | `OllamaService.ts:60-71`; `config/schema.ts:93` | temp/repeat_penalty/seed wired; `repeatPenalty` default now **1.1** (was broken 0.3); `temperature:0` survives end-to-end. *(OOS minor: OpenAI path never forwards `seed`.)* |
| KG-04 | merge×prompts | **PARTIAL** | CONFIRMED | `KnowledgeMerger.ts:460-487,703-705,728-729` | Within-**run** fixed (gate moved to global). But a compliant cross-**run** edge whose endpoint is a retrieved prior-graph/glossary entity (exactly what v5 instructs) still dies at `:728-729`; `entityMap` holds only current-run entities. Repro'd against the real merger. |
| KG-05 | prompts×schema | **PARTIAL** | CONFIRMED | `KnowledgeGraphBuilder.ts:509-510,529-530`; `vocabulary.ts:171-183` | Non-strict (default) fixed. Under `strictVocabulary`, the enum becomes glossary∪escape only, while prompts keep teaching domain predicates → silent `related_to` coercion (`:56` `.catch`). Opt-in residual. |
| KG-06 | corpus glossary | **FIXED** | CONFIRMED | `normalizeGlossary.ts:29-92`; `CorpusAnalyzer.ts:116-196` | `normalizeGlossary` caps (≤20/≤15), snake_cases, case-collapses, drops `has_*`; failures not cached; content-sensitive key (size+mtime). Reproduced the original pathological input → clean. *(Minor deliberate residual: same-byte-length + reset-mtime edit collides.)* |
| KG-07 | checkpoint key | **PARTIAL** | CONFIRMED | `CheckpointService.ts:74-88`; `KnowledgeGraphBuilder.ts:225-241`; `ContainerFactory.ts:773` | Bulk fixed (glossary/classes/system-prompt/grounding folded in). But **`strictVocabulary`** (changes the enum, not the prompt) and **`escalateAbove`** (grounding short-circuit) are absent from the key → toggling either across `--resume` reuses incompatible cached chunks. Repro'd both collisions. |
| KG-08 | grounding | **PARTIAL** | CONFIRMED | `grounding/*`; `FactualMetrics.ts:44-47`; `KnowledgeGraphBuilder.ts:638` | Inline gate fixed (pluggable `IGroundingChecker`, MiniCheck wired, fail-open). Residuals: offline `FactualMetrics` still keyword + verbatim-name (diverges from the run's checker); drop-mode leaves hollow zero-observation entities that keep dangling relations alive. |
| KG-09 | exports | **FIXED** | CONFIRMED | `KblamExportStrategy.ts`, `LoraExportStrategy.ts`, `kbTriples.ts` | `toKbTriples` aggregates one `description` per (name,property); unique keys; LoRA filters then aggregates. |
| KG-10 | data model | **FIXED** | CONFIRMED | `KnowledgeMerger.ts:226-245`; `TranscriptReader.ts`; `contradiction/*` | Supersession writes `invalidAt`/`expiredAt` (invalidate-not-delete); chat-export splits on conversation boundaries; `validAt` from `occurredAt`. *(Mechanism real; `merging.supersession` default `disabled` — see docs delta.)* |
| KG-11 | pipeline I/O | **PARTIAL** | CONFIRMED | `DirectoryProcessor.ts:222,441-451`; `JsonlExportStrategy.ts:42-64` | `fromJSONL` parser correct, but `loadPriorGraphs(options.output)` + the `existsSync` short-circuit (`:441`) read the **verbatim configured filename**, so default `output: knowledge-graph.json` + `--export-format jsonl` looks for `.json`, returns `[]` before `fromJSONL` runs. jsonl cross-run seeding **still dead in the default config**. Confirmed by my own read + the agent's e2e. |
| KG-12 | canon | **FIXED** | CONFIRMED | `agglomerativeCluster.ts:204-305`; `schema.ts:767`; `Canonicalizer.ts:241` | Complete-linkage implemented (CESI) and **is the config default** (`linkage:"complete"`), wired through the caller. My v1 "dormant flag" suspicion was **falsified**. *(Hardening note: the primitive default is still `?? "single"` for future callers.)* |
| KG-13 | merge | **PARTIAL** | CONFIRMED | `KnowledgeMerger.ts:505,530-546,616-628,757-763` | Type-election (vote, specific beats `other`) and `files[]` union fixed. But the file-identity guard keys only on `entityType ∈ {file,document}`; a `config`-typed (or `other`-typed) `package.json` bypasses it and still fuses across projects via the exact-name fast path. |
| KG-14 | security | **PARTIAL (still live)** | CONFIRMED | `kg_tests/ment_less/config.yaml`, `kg_tests/calude_chats_export/config.yaml`, `…/data/conversations.json` | Same `sk-or-v1` token still on disk in **3 files** (two configs + a copy inside exported chat data), unrotated. `.gitignore` mitigates git history only. **Rotate it.** |
| KG-15 | classifier | **FIXED** | CONFIRMED | `LlmContentClassifier.ts:64-89` | Injected `ILLMProvider`, provider-agnostic; no hardcoded Ollama client/host. |
| KG-16 | prompts | **FIXED** | CONFIRMED | `PromptTemplateEngine.ts:84-103`; `templates/v4.5/system.hbs:9-10`; `PromptManager.ts:57,66` | `when` helper binds correct context; v4.5 uses `{{inputDirectory}}/{{filter}}`; `ready` promise awaited on every render path. |
| KG-17 | perf | **PARTIAL** | CONFIRMED | `PromptTemplateEngine.ts:232-253`; `OllamaService.ts:142-145` | Outline warnings + duplicated renderer fixed (as scoped). But no caching added: outline recomputed per chunk from full file text; `ollama.show` per generation. Low severity. |
| KG-18 | UX/robustness | **PARTIAL** | CONFIRMED | `readConfig.ts:23-29`; `OpenAICompatibleService.ts:206-213`; `watch.command.ts:17,28` | 4/5 closed (config throws, `isResponseFormatError` narrowed, dead code removed). `watch.command.ts` **untouched**: still drops events during a run (no trailing rerun) and `ignored:/^\./` never matches absolute paths. |
| KG-19 | logging | **FIXED** | CONFIRMED | `LoggerFactory.ts:18-39` | tslog scale correct; `silent` maps above fatal; `-S/--silent` is now silent. |

**Scorecard: 11 FIXED · 8 PARTIAL · 0 still-broken · 0 regressed.**

### The 8 PARTIALs, expanded

- **KG-04 (high)** — *The v5 cross-file linking feature is structurally defeated for the cross-run case.* v5 (`system.hbs:29-32`, `user.hbs:33-38`) tells the model to point relations at retrieved entities **by name without re-emitting them**. The global gate (`KnowledgeMerger.ts:703-705`) validates endpoints against `entityMap`, built solely from the **current run's** extracted entities (`DirectoryProcessor.ts:141` feeds only `knowledgeGraphs`; `priorGraphs` are deliberately kept out of merge but fed to retrieval). So a compliant edge pointing at a prior-graph/glossary name is dropped as a "true dangler" at `:728-729`. **Fix:** thread a `knownExternalEndpointNames: Set<string>` (prior-graph + corpus-glossary names) into `mergeKnowledgeGraphs`; keep an edge whose endpoints are in `entityMap` **or** that set (materialize a lightweight stub entity for external-only endpoints to preserve referential integrity without re-merging observations).
- **KG-05 (high, opt-in)** — under `strictVocabulary:true` + a glossary + an active classifier domain, `resolveAllowed{Types,RelationTypes}` (`:509-510,:529-530`) return glossary∪escape only, excluding domain+base predicates, while `buildDomainHints` (`PromptManager.ts:292`) and the domain example partial keep teaching them; the `.catch('related_to')` on the enum (`:56`) then silently coerces the taught predicates to `related_to`. Reproduced: 5 medical predicates → 5×`related_to`. **Fix:** thread `strictVocabulary` through the prompt path so under strict the hints/examples are restricted to the glossary (teach exactly the strict ontology), rather than widening the enum.
- **KG-07 (med)** — `strictVocabulary` and `escalateAbove` are not in the checkpoint key (`extractionExtra`/`groundingSignature`); toggling either between `--resume` runs silently mixes chunks built under a different enum / gate threshold. **Fix:** fold the **resolved enums** (`JSON.stringify(resolveAllowed…)`) into `extractionExtra` and add `escalateAbove`+`host` to `groundingSignature`. *(Directly contradicts TECHDEBT's "toggling any extraction-affecting input re-extracts" — see Phase E.)*
- **KG-08 (med)** — offline `FactualMetrics.observationGroundingScore` (`:44-47`) still uses keyword overlap + a verbatim-name precondition that auto-fails snake_case canonical names — diverging from the inline gate (which has no name precondition), so the **benchmark** metric disagrees with the **run** gate. Plus drop-mode leaves hollow 0-observation entities alive. **Fix:** route `detectHallucinations` through the injected `IGroundingChecker`; in drop mode remove entities emptied to 0 observations and their now-dangling edges.
- **KG-11 (med)** — see table. **One-line fix:** `loadPriorGraphs(this.getOutputPath(options.output, options.export.format), …)` at `DirectoryProcessor.ts:222`.
- **KG-13 (med)** — see table. **Fix:** add `config` to `FILE_IDENTITY_TYPES`, or (better) recognize file-identity by name-shape (filename-extension / matches `files[0]` basename) regardless of `entityType`.
- **KG-17 (low)** — cache the outline per file and model capabilities per model name; both fixes are local.
- **KG-18 (low)** — `watch.command.ts`: queue a trailing rerun (`pending` flag) and make `ignored` basename-aware.

---

## Part 2 — New-surface findings (WS-01 … WS-63)

All adversarially verified (`isReal=true`); 5 further candidates were refuted (Phase F). Sorted high → med → low. Schema: ID | area | location | sev | conf | what's wrong → fix.

### High (14)

| ID | Area | Location | Conf | What's wrong → fix |
|---|---|---|---|---|
| WS-01 | eval/CrossRE | `evaluation/datasets/CrossREDataset.ts:52,82` | CONFIRMED | `loadFile` is passed the *remaining* budget as `limit` but its guard `if (out.length >= limit)` compares against the **cumulative** array; once file 1 fills `out` to N, every later file breaks on iteration 0 when `totalLimit ≤ 2N`. With the default `--limit 50` and a dir of 12 alphabetically-sorted files, **only `ai-dev.json` is evaluated** — every multi-domain CrossRE number is single-domain. → Capture `startLen=out.length` before the loop; guard `out.length - startLen >= limit`. |
| WS-02 | citation/web | `references/web/GatedFetcher.ts:63-71` | CONFIRMED | `matches()` uses `url.startsWith(pattern)`; for the documented URL-prefix allowlist form, `https://arxiv.org.evil.com/...` passes `https://arxiv.org`. Document-controlled link content escapes the operator allowlist. → Parse both; require `urlObj.origin === patternObj.origin && urlObj.pathname.startsWith(patternObj.pathname)`. |
| WS-03 | citation | `WebReferenceProcessor.ts:94`; `CitationEvidenceProcessor.ts:210-247`; `FetchCacheService` | CONFIRMED | **Cache-the-failure (KG-02/06 class).** Both processors `cache.append` on *every* outcome incl. transient failures (`resolved:false`); the cache has no TTL → a one-off timeout/503/GROBID-down permanently poisons a cited work's resolution + faithfulness across all future runs. → Only cache *deterministic* negatives (not-allowlisted, robots-disallow, too-large); for timeout/5xx/429 don't cache or use a `transient` TTL keyed on `r.reason`. |
| WS-04 | citation | `CitationEvidenceProcessor.ts:210-213,300-331` | CONFIRMED | Per-URL fetch cache short-circuits `resolveOne` and `fromCache` never re-runs `judge`; a work cited by Doc B (first fetched by Doc A) gets a `cites` edge with **no faithfulness label**, and a work first seen during a GROBID outage never gets re-judged. Verdict is per-URL, not per-(doc,work). → Cache the fetched **content** by URL but compute span-select + `judge` per `(citingRel, ctx)` on every call. |
| WS-05 | image/C2PA | `processor/readers/image/imageMetadata.ts:111-112` | CONFIRMED | **Trust fail-open.** `valid = vstatus.every(v => !/error\|invalid\|fail/i.test(code))`, but real C2PA failure codes (`signingCredential.untrusted`, `assertion.dataHash.mismatch`, `assertion.hashedURI.mismatch`, `timeStamp.mismatch`) contain none of those substrings → tampered/untrusted manifests are marked **valid**, defeating the module's stated invariant. → Per the C2PA spec each `validation_status` entry carries an explicit success flag and the array conventionally lists only failures: treat any present failure-status entry as invalid (don't substring-match codes). *(Phase C source.)* |
| WS-06 | sqlite | `adapters/SqliteAdapter.ts:202-208,153-166` | CONFIRMED | Composite FKs are split into independent single-column edges (the `id`/`seq` grouping from `foreign_key_list` is discarded), **fabricating wrong relations** + duplicate predicates — on a path advertised as "no LLM, no hallucination." → Group FK rows by `id`; emit one edge per composite FK only when all parts resolve to the same parent tuple. |
| WS-07 | sqlite | `adapters/SqliteAdapter.ts:206,161-162` | CONFIRMED | Implicit-PK FK shorthand (`author_id REFERENCES authors`, no parent column) yields `to=NULL` → `String(r.to)`=`"null"` → index lookup `authors␟null` misses → **every such edge silently dropped**. → Resolve null `to` to the parent table's PK column. |
| WS-08 | sqlite | `adapters/SqliteAdapter.ts:104,130-138` | CONFIRMED | PK detection picks only the **first** `pk` column; composite-PK rows `(1,100)` and `(1,200)` collapse to one entity identity + one locator → data loss + corrupted provenance on junction/time-series tables. → Collect all `pk` columns; use the joined tuple for identity, locator, and FK index key. *(TECHDEBT logs composite-PK as "deferred" — but the README advertises the adapter as working.)* |
| WS-09 | ast-seeding | `processor/ast/AstSeedService.ts:54-58`; `AstSymbolStore.ts:45-57` | CONFIRMED | **Cache-the-failure (KG-02/06 class).** `extractSymbolsSafe` never returns undefined — on parse failure / unknown ext / non-tree-sitter generator it returns a truthy empty table; the `if (!table) return null` guard is dead, so the empty table is written to the persistent `.ast-cache.json` and the file's symbols are dropped on **every later run** even after the cause is fixed. → Only `store.set` when `table.symbols.length > 0`; gate by `isSupported(ext)`. |
| WS-10 | pdf | `readers/DoclingReader.ts:138-157`; `ContainerFactory.ts:382-388` | CONFIRMED | Unlike every sibling engine, `DoclingReader` has **no `pdf2json` fallback** and returns `{chunks:[]}` on failure → `pdfEngine: docling` on a machine without docling silently produces **empty graphs + zero exit** (the KG-02 "empty looks like success" shape). → Give it a `fallback: FileReader` and call it in the catch; at minimum throw on empty. |
| WS-11 | pdf | `FileProcessor.ts:90-93`; `MarkerPdfReader.ts:88` (+ siblings) | CONFIRMED | On PDF fallback, the matched reader is still e.g. Marker, so `reader.adapterId()` stamps `sourceAdapter:"pdf:marker"` even though `pdf2json` produced the text (the fallback sets no `sourceAdapter`). Every per-engine eval/audit keyed on `sourceAdapter` is wrong exactly when a fallback fired. → Have the fallback branch stamp `sourceAdapter: this.fallback.adapterId()` on the returned chunks. |
| WS-12 | trace/lineage | `canon/Canonicalizer.ts:120-156,210-222`; `ContainerFactory.ts:867` | CONFIRMED | `trace.lineage.fold` is wired only into `KnowledgeMerger`; the Canonicalizer runs **after** merge with its own clustering/renaming and never folds lineage → `mentionsFor(canonical)` under-attributes every surface form canonicalization collapsed (the stated purpose of the lineage layer is wrong for any run with canon on). → Route each non-canonical cluster member through `trace.lineage.fold(member, canonical)` + a `merge_decision` emit. |
| WS-13 | cost | `cost/CostMeter.ts:105,118,132`; `DirectoryProcessor.ts:182-205` | CONFIRMED | `priceFor` falls back to `{in:0,out:0}` for any unmatched model → `cost=0` → the `--max-cost` cap (`:132`) never trips. A budget ceiling on an unpriced/new model id is **unlimited spend**, info-level note only. → When `maxCost` is set and `priceFor`→0, escalate to warn/error and refuse or fall back to estimated tokens so the cap can act. |
| WS-14 | pipeline/config | `config/schema.ts:702-708,847-850`; `pipeline/RelationFilterTransform.ts:27`; `PipelineRunner.ts:55-66` | CONFIRMED | **Dead feature.** `RelationFilterTransform` (stage `"relationFilter"`, the `related_to` pruning gate, "~30% of edges") is registered and enabled by `relationFilter.mode != "off"`, but `"relationFilter"` is **not in `DEFAULT_STAGES`**, and the runner only executes listed stages → setting the mode does nothing, no warning. Found independently by 2 agents. → Add `"relationFilter"` to `DEFAULT_STAGES` (after `canonicalization`) + `TRANSFORM_STAGES`; add a runner test for `mode:"all"`. |

### Medium (16)

| ID | Area | Location | What's wrong → fix |
|---|---|---|---|
| WS-15 | citation/web | `GatedFetcher.ts:106-114` | **SSRF:** `redirect:"follow"`; only the pre-redirect URL is allowlist-checked → a permitted host can redirect to loopback/RFC1918/metadata. → `redirect:"manual"`, re-run `allowed()` + private-IP/scheme denylist per hop. |
| WS-16 | grounding | `MiniCheckGroundingChecker.ts:53-57`; `FactualMetrics.ts:36-42` | MiniCheck keyword pre-filter accepts a **relation** as grounded when only the predicate word matches (or all triple tokens are ≤3 chars) → edge passes with neither endpoint in the source, no NLI call. → Require both endpoints present before the pre-filter can short-circuit-accept a relation. |
| WS-17 | grounding | `MiniCheckGroundingChecker.ts:82-90` | No timeout/AbortSignal on the Ollama NLI call → a hung daemon stalls the entire grounding gate (sequential callers). → `AbortSignal.timeout(ms)` / race a reject so the existing catch→keyword fallback engages. |
| WS-18 | citation | `MiniCheckGroundingChecker.ts:71-78`; `CitationEvidenceProcessor.ts:408` | On MiniCheck outage the gate degrades to keyword-overlap and **caches** that verdict, biasing cited-work faithfulness to `unsupported` permanently. → When `checker==="keyword"` (NLI didn't run) abstain (return null), don't cache. |
| WS-19 | config | `config/schema.ts:24` (`num` helper) | `z.coerce.number().default()` coerces YAML `null`/empty-string to **0**, not the default → e.g. `chunking.size: ` silently becomes 0. → `z.preprocess(v => v===""||v===null ? undefined : v, z.coerce.number()).default(def)`. |
| WS-20 | image/EXIF | `imageMetadata.ts:43-44`; `imageMetaGraph.ts:69-92` | EXIF capture time round-tripped through a local-time `Date` shifts `validAt` by the host UTC offset and falsely labels it UTC. → Read the raw datetime + `OffsetTimeOriginal`; build ISO with the real offset or preserve as floating local. |
| WS-21 | trace/lineage | `KnowledgeMerger.ts:616,628` | Cross-file disambiguation rename (`uniqueName`) isn't registered with lineage → renamed node has empty `mentions`, bare-name bucket conflates both files. → Fold lineage from `entity.name`→`outName` in the disambiguation branches. |
| WS-22 | cost | `cost/prices.ts:27-29` vs `CostMeter.ts:99-106` | OpenRouter dotted Anthropic ids (`claude-3.5-sonnet`) don't match the hyphenated price keys → resolve to **$0** (silent, and compounds WS-13). → Add dotted aliases or fold dot/hyphen in `priceFor`. |
| WS-23 | cost | `DirectoryProcessor.ts:160-178` | `persistLedger()` only on the success path; a crash loses the run's spend from the cumulative ledger. → Persist in `finally`/catch before re-throw (it's best-effort/never-throws). |
| WS-24 | ast-seeding | `AstSeedService.ts:68,74-81` | AST-seeded observations carry no `sourceAdapter`/`locator`, unlike sibling deterministic seeds (EXIF/C2PA/sqlite) → provenance asymmetry. → Stamp `sourceAdapter:"ast"` + `locator:"L"+startLine`. |
| WS-25 | ast-seeding | `DirectoryProcessor.ts:547-548`; `KnowledgeMerger.ts:113-116` | Seed symbols deduped against LLM entities by name only → `countTerms` (camelCase symbol) vs natural-language surface form yields duplicates. → camelCase/snake-aware `normalizeEntityName`, or a pre-merge reconciliation map. |
| WS-26 | new-readers/chat | `ChatExportReader.ts:158-177` | WhatsApp: continuation lines of a **dropped** system message leak into the previous real user's turn. → Track `lastWasDroppedSystem` and swallow its continuation lines. |
| WS-27 | new-readers/latex | `LatexReader.ts:99-126` | De-TeX leaks environment names (`itemize`/`abstract`/…) as orphan tokens into cleaned prose. → Strip `\begin{…}`/`\end{…}` wrappers for all environments before the generic unwrap. |
| WS-28 | pdf/marker | `MarkerPdfReader.ts:159-164` | `--use_llm` passes model/base-url/key via `OPENAI_*` env vars marker's `OpenAIService` doesn't read → configured `llm.model/host` ignored. → Pass explicit `--openai_model`/`--openai_base_url` CLI args (confirm marker's contract). |
| WS-29 | pipeline | `PipelineRunner.ts:50-52` vs `54-68` | `hasWork()` and `run()` gate on different conditions → an enabled-but-unlisted transform (WS-14) makes `hasWork()` report work while `run()` no-ops, hiding stage-list drift. → Compare config-enabled transforms against `pipeline.stages` and warn on any enabled token absent from the list. |
| WS-30 | sqlite | `adapters/SqliteAdapter.ts:232-239,142-163` | A non-unique human **label** used as node identity makes FK targets ambiguous and silently fuses distinct rows. → Keep PK-based `table#pk` identity for wiring; surface the label as an observation/alias. |

### Low (33)

| ID | Area | Location | What's wrong → fix |
|---|---|---|---|
| WS-31 | ast-seeding | `AstSeedService.ts:51-54`; `astSymbols.ts:6-9` | Cache key is content-hash only → byte-identical files of different extensions collide and reuse the wrong-grammar parse. → Mix `ext` into the hash. |
| WS-32 | ast-seeding | `config/schema.ts:317`; `PromptTemplateEngine.ts:239-249` | Outline injection `maxDepth` has no default (unbounded); `maxDepth:0` also disables it. → `.default(4)` + char/node cap; fix the `0` semantics. |
| WS-33 | citation | `MiniCheckGroundingChecker.ts:69` | Per-sentence supported-fraction makes the `uncertain` band unreachable on the dominant single-sentence path (score is 0 or 1). → Threshold on the model's continuous Yes-probability, or derive uncertainty from per-sentence disagreement. |
| WS-34 | citation/web | `GatedFetcher.ts:84-103,189-192` | robots.txt and LLM-relevance gates fail **open** on transport/LLM error → politeness/relevance not the "always-on" guarantee the docs imply. → Cache empty-disallow only on real 200/404; offer fail-closed. |
| WS-35 | citation/config | `config/schema.ts:502-505`; `CitationEvidenceProcessor.ts:416-421` | `uncertainBand` has no `lo≤hi`/`0..1` validation → an inverted band silently disables `uncertain`, over-reporting `supported`. → `.refine(([lo,hi])=>lo>=0&&hi<=1&&lo<=hi)`. |
| WS-36 | exports | `McpExportStrategy.ts:45-51`; `GraphitiExportStrategy.ts:43-51` | `faithfulness`/`faithfulnessScore`/`supportingSpan`/`resolved` dropped by MCP + Graphiti exporters (the merger preserves them). → Emit as edge properties. *(Candidate over-claimed JSONL; JSONL is fine.)* |
| WS-37 | classifier | `FileProcessor.ts:155-160`; `mergeClassifications.ts:28-31` | Per-chunk LLM tie-break gets averaged away at file level → wasted escalation cost. → Run heuristic per chunk, merge, escalate once on the merged distribution. |
| WS-38 | classifier | `CascadeContentClassifier.ts:67,88-94` | Trace hardcodes `gate:"multi"` on collapses and double-emits a conflicting classify event per escalated chunk. → Compute post-collapse gate; emit after `collapseTie`. |
| WS-39 | classifier | `shared/utils/softmax.ts:18-20` | softmax silently returns uniform for NaN/non-finite input. → Guard `!Number.isFinite` explicitly; distinguish from the all-equal case. |
| WS-40 | config | `config/schema.ts:736-743,710-720,851-853` | Dead config: `tfAnalysis.enabled/source`, `schemaInduction.enabled`, `extraction.enabled` accepted but never read. → Wire the toggles or remove them (note Experiment-1 fixes them on). |
| WS-41 | config | `config/schema.ts:873` | Dead config: `eval.groundTruth` accepted but never read. → Wire into scoring or remove. |
| WS-42 | eval/MINE | `MineScorer.ts:58,66-71,103`; `MineRunner.ts:96,102` | Embedding errors in `retrieve()`/`embedBatch` propagate out and abort the run, unlike judge failures (which return a miss) — asymmetric isolation. → Wrap embeds in try/catch → empty context (miss). |
| WS-43 | grounding | `MiniCheckGroundingChecker.ts:93-95` | `parseVerdict` `startsWith("1")` accepts any digit-prefixed prose (`"1. No"`). → Match a leading `yes`/exact `1`/`true` whole-token; reject `1.`/`1)`. |
| WS-44 | image/C2PA | `imageMetadata.ts:85-91`; `imageMetaGraph.ts:99` | A present-but-invalid manifest is misreported as `unavailable` on c2patool builds that abort validation failures to stderr (non-zero exit). → Inspect stderr for validation_status markers → `{present:true, valid:false}`. |
| WS-45 | image/cv | `cv/ObjectDetectionService.ts:72`; `imageMetaGraph.ts:120-141` | `Detection.box` produced + persisted but never read. → Drop it, or emit as a `bbox:` locator on the `depicts` observation. |
| WS-46 | data model | `types/Observation.ts:30-37`; `KnowledgeMerger` tie-break | `Observation.confidence/sourceAdapter/locator` are export-only; merge dedup tie-breaks by **text length**, ignoring `confidence`. → Wire a consumer (prefer higher confidence) or soften the type doc to "export-only provenance." |
| WS-47 | new-readers/epub | `EpubReader.ts:118-123` | Chapter title taken from `<head><title>` (book title) not the body heading. → Prefer `h1`/`h2`, fall back to `<title>`. |
| WS-48 | new-readers/email | `EmailReader.ts:213-222` | Quote-stripping misses a wrapped "On … wrote:" attribution split across two lines. → Non-anchored multiline `/^\s*On\b[\s\S]*?\bwrote:\s*$/m`. |
| WS-49 | new-readers/email | `EmailReader.ts:184-201` | mbox splitter splits mid-body on prose lines beginning `From … <year>`. → Tighten to the RFC4155 `From <addr> <Day> <Mon> <dd> <hh:mm:ss> <yyyy>` shape. |
| WS-50 | new-readers/chat | `ChatExportReader.ts:283-289` | Slack labeled mentions `<@U…\|name>` and `<!here>`/`<!channel>` leak raw syntax. → Add label/special-mention replace rules before the bare-id rule. |
| WS-51 | pdf/docling | `DoclingReader.ts:214` | Leftover un-awaited `debug_output_text.txt` write to CWD (unhandled rejection). → Delete, or gate behind a debug flag into `tempDir`. |
| WS-52 | pdf/docling | `DoclingReader.ts:175,184-185` | Clobbers injected `pythonExecutable`; `maxPages` field dead (`--max-pages` commented). → Use injected executable; wire or drop `maxPages`. |
| WS-53 | pdf/docling | `DoclingReader.ts:376-420` | Hardcoded 5-min timeout, dual close handlers, unclosed stdin (inconsistent with siblings). → Single close handler clearing the timer; `stdio[0]:"ignore"`; configurable timeout. |
| WS-54 | pdf/mistral | `MistralOcrReader.ts:66-67,91,169-172` | Silently drops empty pages and undercounts `pageCount`, no per-page failure signal. → Warn on `usable.length < pages.length`; record `pagesDropped`. |
| WS-55 | audio | `AudioReader.ts:312-319` | Whisper path stamps no `asrEngine` tag (dual does at `:385`) → per-fact engine unrecoverable. → Set `asrEngine:"whisper"`; reflect engine in `adapterId()`. |
| WS-56 | pipeline | `DirectoryProcessor.ts:795` | Misleading "after canon" comment: `relationFilter` array position has no effect on order (governed by `pipeline.stages`). → Fix comment, or enforce the post-canon invariant in `parseConfig`. |
| WS-57 | sqlite | `adapters/SqliteAdapter.ts:130,212` | No-PK tables get positional row-index identity/locator that drifts across re-ingest. → `SELECT rowid` (guard WITHOUT ROWID) as the stable key. |
| WS-58 | sqlite | `adapters/SqliteAdapter.ts:242-247` | `cellObservation` ignores declared `ColInfo.type` → BOOLEAN renders 0/1, DATE not normalized. → Consult `c.type`: render booleans, normalize dates to ISO-8601. |
| WS-59 | trace/cost | `ContainerFactory.ts:109,121`; `DirectoryProcessor.ts:835` | **KG-11 class:** trace + cost sidecars use the raw `--output` stem, not the extension-rewritten graph path → artifact split when `export-format` ≠ output extension. *(TECHDEBT logs this as open debt; same `getOutputPath` root cause as KG-11.)* → Compute the final path once, base all sidecars on it. |
| WS-60 | cost | `OpenAICompatibleService.ts:215-231` | Calls with no `usage` block are silently unmetered ($0) (compounds WS-13). → Estimate tokens on missing usage and still `meter.record`. |
| WS-61 | trace | `TraceWriter.ts:36-43,59`; `KnowledgeGraphBuilder.ts:425` | Resumed runs append duplicate extraction events to the trace sidecar (no truncate; seq restarts per run). → Truncate/rotate on fresh configure, or document group-by-runId + replay semantics. |
| WS-62 | trace | `trace/events.ts:77,83,116,123,132` | Vestigial fields: `attempt` always 0; `jaroWinkler`/`digitVeto`/`droppedByGate` declared, never set; a `verdict?a:a` no-op ternary. → Populate from the merger/canon/gate data or drop the fields. |
| WS-63 | sqlite | (see WS-08/WS-06 group) | *(reserved — relationFilter duplicate merged into WS-14; numbering preserved.)* |

---

## Top findings by leverage (impact ÷ effort)

1. **WS-14 — `relationFilter` never runs.** A documented first-class feature is dead; the fix is **one string in `DEFAULT_STAGES`**. Highest leverage in the report.
2. **KG-11 — jsonl cross-run seeding still dead by default.** One-line `getOutputPath` fix; restores the README-recommended config's advertised cross-run consistency, and resolves a false "Paid down" claim.
3. **WS-01 — CrossRE single-domain collapse.** Small guard fix; without it every multi-domain CrossRE leaderboard number is one domain. For a research platform, this corrupts the evidence base.
4. **WS-05 + WS-44 — C2PA fail-open.** Small fix (use the explicit success flag); without it the graph asserts cryptographic validity for tampered/untrusted content — the exact authenticity conflation the module claims to avoid.
5. **The cache-the-failure trio (WS-03, WS-09, + DoclingReader WS-10).** Same anti-pattern KG-02/KG-06 fixed, re-emerged in three new subsystems; a transient blip permanently poisons faithfulness verdicts / AST symbols / PDF graphs. Fix is one disciplined rule: *never cache a transient failure as a result.*
6. **KG-04 — cross-run edges destroyed.** The v5 retrieval-linking feature is structurally defeated; ~15-line `knownExternalEndpointNames` fix.
7. **KG-14 — rotate the live API key.** Operational/security; do it now.

---

## Phase C — sources used (each changed a recommendation)

| Source | What it claims | What it changed |
|---|---|---|
| C2PA Technical Specification 2.x §15 ([spec.c2pa.org](https://spec.c2pa.org/specifications/specifications/2.2/specs/C2PA_Specification.html)) + CAI validation guide ([opensource.contentauthenticity.org](https://opensource.contentauthenticity.org/docs/js-sdk/guides/validation/)), [Truepic validate docs](https://lens.truepic.dev/docs/c2pa-validate) | Each `validation_status` entry carries an explicit success boolean; failure codes are dot-namespaced (`signingCredential.untrusted`, `assertion.dataHash.mismatch`, …) and the array conventionally lists only failures | **WS-05/WS-44 fix:** stop substring-matching `error\|invalid\|fail` out of opaque codes (which never match real failures → fail-open); use the explicit success flag / treat any present failure-status entry as invalid |

Carried over from v1 (still the right basis, not re-litigated): MiniCheck (EMNLP 2024, [arXiv:2404.10774](https://arxiv.org/abs/2404.10774)) — the grounding seam was correctly built around it; CESI complete-linkage (WWW 2018, [arXiv:1902.00172](https://arxiv.org/abs/1902.00172)) — KG-12 implemented exactly this. Searches deliberately **not** cited (would be decoration, don't change a fix): OWASP SSRF guidance (WS-15 fix is standard origin/IP validation), SemEval-2010-T8 scoring (WS-01 is a logic bug, not a protocol question).

---

## Phase E — Reconciliation with the project's self-claims

Read after Track 1+2 were locked: `TECHDEBT.md`, `docs/PROJECT_STATE.md`, `ROADMAP.md`, `docs/archive/AUDIT_REPORT.md`, commit messages, `docs/inbox/*`.

### Where the project's claims overstate the code (divergence)

1. **`TECHDEBT.md` "Paid down" overclaims KG-07.** It states the checkpoint key folds "glossary + classifier classes + retrieved context + system-prompt (resolved vocab/schema) + grounding … so toggling **any** extraction-affecting input between `--resume` runs re-extracts." But `strictVocabulary` changes the resolved enum **without** changing the system-prompt string (the glossary vocab renders identically), so it's invisible to the key; and `escalateAbove` is omitted from `groundingSignature`. Both reproduced as cache collisions. KG-07 is PARTIAL, not paid.
2. **`TECHDEBT.md` "Paid down" overclaims KG-11.** It states "the README-recommended jsonl output round-trips without the per-run warning." It does **not** in the default config: `loadPriorGraphs(options.output)` reads the verbatim configured `.json` name while the writer produced `.jsonl`, so `existsSync` returns `[]` before `fromJSONL` runs. Notably this is the **same `getOutputPath` extension-rewrite root cause** the project *does* log as open debt ("Sidecar paths diverge from the exported graph path") — the two weren't connected.
3. **README vs default config.** Grounding ("won't record what it can't verify") and the bi-temporal axis are sold unconditionally, but both gates ship **off** (`grounding.mode:disabled`, `merging.supersession:disabled`). `PROJECT_STATE.md` is honest here ("Real (opt-in)"); the README is the artifact to fix.
4. **Closed-vocab `.catch` framed as a feature is also the KG-05-strict bug.** `PROJECT_STATE.md` praises the per-field `.catch` escape ("coerces rather than nuking the chunk"); under `strictVocabulary` + active domain that same coercion silently destroys the domain predicates the prompt teaches (KG-05 residual).

### Where the project already knows, and I credit it (these reduce novelty, not validity)

- **Sidecar path mismatch** (TECHDEBT Open) = WS-59, and is the KG-11 root cause — logged, unfixed, frontend works around it.
- **SQLite composite-PK / junction / views** "deferred" (TECHDEBT) overlaps WS-06/WS-08 — but the README advertises the adapter as working, and WS-07 (implicit-PK silent drop) and WS-30 (label identity) aren't in the deferral list.
- `corpus.clustering` stub (= WS, config), `document-outline-gen` commit-pin, NER `examples` dead array, complete-linkage O(n³)-without-blocking, KG-12b co-occurrence gate (OFF by default), CV-forensics-2b-not-built, data-sink-readers-not-live-validated, cost-meter-doesn't-cover-embeddings — all logged. The new-reader parse bugs (WS-26/27/47/48/49/50) and the EXIF/C2PA *logic* bugs (WS-05/WS-20/WS-44) go beyond "not live-validated" — they're correctness defects, not just unrun features.

### Where the project agrees and delivered (credit)

KG-13 "conceptual same-name entities still merge cross-file" is honestly noted as a known residual (my WS-side sharpens it: `config`-typed file artifacts also slip the guard). The merge/canon/vocab arc, the data-model integrity sprint, and the closed-vocab enum are real, tested work. `PROJECT_STATE.md` (2026-06-24) is accurate and self-aware — a genuine improvement over the v1-era stale snapshot.

### Net-new (absent from every project doc — keyword-confirmed)

WS-14 (`relationFilter` dead — `relationFilter`: 0 docs), the fail-open trust gates (`fail-open`/`SSRF`: 0 docs — WS-05/15/16/34/44), WS-03/WS-04/WS-09 (cache-the-failure in citation/AST), WS-01 (CrossRE collapse), WS-12 (Canonicalizer bypasses lineage), WS-13 (max-cost fail-open), WS-11 (PDF fallback provenance lie), WS-19 (`z.coerce` null→0), WS-22 (OpenRouter pricing $0).

---

## Phase F — Self-audit

**Quarantine integrity.** Unlike v1 (which had a contamination slip), this pass kept `TECHDEBT.md`/`PROJECT_STATE.md`/`ROADMAP.md`/`docs/inbox` unread until Phase E; README was read in Phase A as the docs-delta target (legitimate). Workflow agents were instructed to base verdicts on current code, treating commit messages as claims.

**Discrimination check (evidence the verify stage worked, not rubber-stamped).** Track 2 refuted **5 of 68** candidates: (a) "Observation.confidence overloads two meanings" — refuted, the constants are extractor-reliability by design; (b) "escalation budget consumed when LLM pick discarded" — refuted by the code's documented contract; (c) "Mistral host SSRF" — the host is operator-config, not document-controlled (unlike WS-02/15 which *are*); (d) "verbalizeRelation degenerate claim" — refuted, the verbalization is adequate; (e) "empty-sentence claim fails open" — refuted, the empty path is guarded. Track 1's refute stage also **downgraded KG-13 from a tentative FIXED to PARTIAL** and reproduced KG-04/KG-05/KG-07 residuals against real source.

**What I could not verify (+ settling tests):**
- **Live LLM/network/subprocess behavior.** All findings are static + small Node repros against real `node_modules`; no live Ollama/cloud extraction, GROBID, c2patool, or marker/docling run was performed (cost/keys/binaries). Settling tests are embedded per finding (e.g. WS-01: `load(crossre_data/, 50)` and assert domains; WS-05: feed a `signingCredential.untrusted` manifest and assert `valid=false`; KG-11: run twice with `output: kg.json --export-format jsonl`, assert run 2 loads).
- **Symbol survival (forcing fn 4).** The newest self-graph (`kg_tests/self/kggt5-knowledge-graph.json`, Jun 6) predates `892d317`, so it tests the old pipeline. A fresh self-run on HEAD is the settling test; the higher-leverage version (eval-scorer correctness) was done and surfaced WS-01/WS-42.
- **README claim count ("~22 readers").** Counted by file, not by a live routing matrix.
- **The 5 refuted candidates** may be partially-right at the margins; I deferred to the skeptic's contract reading.

**Weakest findings (ranked):** WS-62/WS-56 (vestigial fields / misleading comment — cosmetic), WS-46/WS-45 (write-but-not-read provenance — design-debt not a present-tense bug, and `PROJECT_STATE` half-acknowledges), WS-33 (uncertain-band unreachable — depends on a scoring choice), WS-31 (ext-collision cache key — needs a contrived byte-identical pair). KG-17's perf residual is directional and unprofiled on small corpora.

**Strongest findings:** WS-14 (dead feature, trivially reproduced), KG-11 (read + e2e, contradicts a "Paid down" claim), WS-01 (logic bug, reproduced), WS-05 (spec-confirmed fail-open), the cache-the-failure trio (same pattern, three sites), KG-14 (key on disk, observed).

**Bias check.** The brief warns against rubber-stamping a sprint of clearly-good work. I consciously pushed back twice: (1) "11/19 fixed, suite green" is true but masks that 8 are PARTIAL and that *bug patterns* (cache-the-failure, sidecar-path, homonym-merge) propagated into the new code the fixes didn't cover; (2) the project's own "Paid down" ledger is itself drifted (KG-07/KG-11 overclaimed) — the same drift v1 caught in the *old* TECHDEBT. The fixes are real; the *completeness* claims are not.

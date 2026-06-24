# kg-gen — Implementation, Refactoring & Improvements ROADMAP
**Supersedes the stale ROADMAP.md.** Date: 2026-06-11. Composes with `AUDIT_REPORT.md` (Fable 5 / Cheetah audit, 2026-06-10, repo @ 892d317) — findings are referenced by their KG-NN IDs. This document is the planning seed for Claude Code CLI sessions. Each phase is independently plannable, strictly ordered, and gated.

> **Status — 2026-06-21 (pre-Phase-10 release).** Phases **1–8 have LANDED** and are verified against
> `src/` (correctness foundation · vocabulary single-source · cross-file linking · canon hardening ·
> MiniCheck grounding · data-model integrity · training-export correctness · AST seeding — cross-check
> against TECHDEBT.md "Paid down"). The **Phase-9** knowledge-injection spike is **in progress**
> (`examples/kg-injection/`, LoRA-MLX on the M4; KBLaM vs LoRA decision pending). **Phase 10 is now
> split** into a bounded *Release* + a *Phase 11 Scale* track — see
> [`ROADMAP-phase10-release.md`](./ROADMAP-phase10-release.md), which is the **active** planning doc
> for the release. The phase bodies below are preserved as the original sprint plan; where they
> disagree with the code, the code and TECHDEBT.md win.

## How to use this document
- **Strict order.** Complete one phase, confirm its Verification block passes, then proceed. Do not start phase N+1 with phase N's gate red.
- **Compose with AUDIT_REPORT.md.** Each work item cites the KG-NN finding(s) it closes; open AUDIT_REPORT.md alongside for the file/line pointers and reproduction logs.
- **Effort signal** uses the audit's lines-of-change scale: XS (<20 LOC), S (20–80), M (80–250), L (250–600), XL (>600 / multi-file architectural).
- **Research-changed flags** mark where 2025–2026 literature materially changed a design decision (audit's "citations must change a recommendation" rule). Decoration-only citations are omitted.
- **Do-not-re-plan.** Phases 0–4 of the prior sprint, Merge-quality Phases A/B/D, NR-1…NR-4, jsonrepair, the frontend, and the metrics/inspect-merges subcommands are LANDED. This roadmap addresses only OPEN items.

---

## Sequencing logic (why this order)
Severity ≠ leverage. The ordering below is dependency-driven:

1. **Correctness foundation first (Phase 1).** KG-01/02/03/14 are not just bugs — KG-03 (sampling params disabled) means *every local benchmark number in the repo is noise-contaminated*, and KG-02 (cache-the-failure) means any later quality measurement taken with `--resume` is reading poisoned checkpoints. Nothing downstream is measurable until these land. KG-14 (leaked key) is a security stop-ship that is trivially parallel.
2. **Vocabulary coherence (Phase 2).** KG-05/06 are a trust-boundary failure: the weakest model (flash-lite glossary call) holds schema authority over all extraction. Fixing cross-file linking or canon before the vocabulary is single-sourced just re-merges incoherent types.
3. **Cross-file linking contract (Phase 3).** KG-04 structurally destroys compliant cross-file edges *before* global merge. Must precede any canon re-tune, because canon operates on the survivors.
4. **Canon hardening (Phase 4).** Complete-linkage + embeddinggemma re-tune + KG-12. Depends on Phase 3 (needs the real edge population) and Phase 2 (needs coherent types).
5. **Grounding upgrade (Phase 5).** MiniCheck inline gate. Independent of canon; depends on Phase 1 (determinism) to be measurable.
6. **Data-model integrity (Phase 6).** KG-10/13 bi-temporal/speaker/conversation-boundary + type-election fix.
7. **Export correctness for training data (Phase 7).** KG-09. Must precede the LoRA/KBLaM spike — the spike consumes these exports.
8. **AST-seeded code extraction (Phase 8).** Highest-leverage *recall* fix, but orthogonal to the correctness chain; slotted after the pipeline is trustworthy.
9. **Knowledge-injection spike (Phase 9).** Consumes clean ~1K-triple dataset from Phases 1–7.
10. **Infrastructure/scale + Experiment-2 decision (Phase 10).**

A stale-docs workstream (Phase D) runs continuously alongside. A decision-points section closes the document.

---

## Phase 1 — Correctness foundation
**Goal:** Make the pipeline tell the truth — readers route correctly, failures surface instead of caching as empty, local inference is deterministic, and the leaked credential is rotated — so that every subsequent measurement is trustworthy.

**Closes:** KG-01, KG-02, KG-03, KG-14, KG-18 (partial: the "any HTTP 400 permanently downgrades json_schema" and "readConfig returns {} for unknown extensions" sub-items), KG-19.

### Work items
1. **KG-14 (stop-ship, do first, parallelizable): rotate + gitignore the OpenRouter key.** Plaintext key in `kg_tests/self/config.yaml`. Rotate the credential at the provider, purge from git history if policy requires, add to `.gitignore`, switch to env-var indirection. Effort: XS.
2. **KG-01: reader routing.** `FileReader.canRead` uses `ext.startsWith(e)` and `TextReader`'s extension list contains `''`, so TextReader claims every file and is registered before AudioReader → `.mp3/.mp4/.wav` read as UTF-8 mojibake and Whisper ASR is dead/unreachable; BinaryReader is never registered. Fix: exact extension equality; explicit no-extension handling; reorder the factory so specific readers precede TextReader; register BinaryReader as the final fallback. Add a routing unit test asserting each sample extension hits the intended reader. Effort: M.
3. **KG-02: stop caching failures.** `generateKnowledgeGraph` swallows all errors and returns an empty graph; `buildChunk` then checkpoints the empty graph as "done", so `--resume` skips failed chunks forever (permanent silent recall holes). Same anti-pattern in `CorpusAnalyzer` (failed glossary cached as empty, reused forever). Fix: distinguish *failure* from *empty-but-valid*; never write a checkpoint for a chunk whose extraction threw; surface a non-zero exit / failed-chunk manifest. Effort: M.
4. **KG-03: wire sampling parameters.** `temperature`, `repeat_penalty`, `seed` are commented out of `OllamaService` request options → local path runs at Ollama's default temperature, not the documented 0.1. Fix: pass `temperature` (0.1), a fixed `seed`, and a corrected `repeat_penalty` (Ollama semantics: values <1.0 *promote* repetition; the 0.3 default is broken — set ≥1.0, e.g. 1.1). **Research-changed:** structured/JSON-format output breaks seed determinism in Ollama even when raw text is deterministic (ollama/ollama issue #12559: "the structured output somehow breaks the determinism I expected") — so the verification gate must measure *graph-level* stability across repeated runs, not assume bit-exactness, and the benchmark re-run must report variance, not a single number. Effort: S (the wiring) + the benchmark re-run (L).
5. **KG-03 consequence — invalidate and re-run local benchmarks.** Every prior local A/B number is contaminated. Re-run the five-model comparison and any local leaderboard rows after the sampling fix. Treat all pre-fix local numbers as deleted. (Note: the five-model comparison's headline result — local Gemma 3 4B placing second on recall, beating larger cloud Gemmas — must be re-confirmed under correct sampling before it can support the offline-first thesis.) Effort: L (compute, not code).
6. **KG-18/KG-19 cleanup (parallelizable):** `readConfig` returning `{}` for unknown extensions (silent defaults) → fail loud or warn-and-skip; "any HTTP 400 permanently downgrades json_schema mode" → scope the downgrade per-request; tslog `minLevel` is off by two notches and `--silent` still prints warn/error → fix the mapping. Effort: S.

### Out of scope (Phase 1)
- Grounding quality (Phase 5), vocabulary normalization (Phase 2), any prompt edits (Phase 2/3), KG-17 performance profiling.

### Verification (gate)
- **Routing:** new test passes; an `.mp3` fixture routes to AudioReader (or BinaryReader if Whisper disabled), never TextReader. **Fail if** any audio/binary extension still decodes as text.
- **Failure semantics:** an injected extraction error on one chunk leaves that chunk *uncheckpointed*; a subsequent `--resume` retries it. **Fail if** a thrown chunk is ever marked done.
- **Determinism:** two consecutive local runs on a fixed corpus with fixed seed produce graphs whose entity/edge counts and node sets are stable within a documented tolerance; the tolerance and the structured-output caveat (#12559) are recorded. **Fail if** variance is large and undocumented.
- **Security:** the old key is revoked at the provider and absent from the working tree. **Fail if** any plaintext secret remains tracked.
- **Benchmarks:** the local five-model table is regenerated post-fix and the old numbers are struck from docs.

---

## Phase 2 — Vocabulary & schema single source of truth
**Goal:** Make one validated, normalized vocabulary the sole authority for entity/relation types, so the closed-vocab v5 design stops being silently corrupted by the weakest model in the pipeline.

**Closes:** KG-05, KG-06, KG-15 (LlmContentClassifier hardcoded Ollama client → cloud 404s), KG-16 (Handlebars `when` helper, literal `${pwd}/${filter}`, unawaited template-init race).

### Work items
1. **KG-06: `normalizeGlossary()`.** The corpus glossary is never validated before becoming the authoritative closed vocabulary (observed: 29 types when the prompt demanded 8–20; spaced predicates `is a`/`part of` duplicating base `part_of`; banned `has_*` attribute family; case-fragmented `Concept`(99)+`concept`(58)). Implement: snake_case canonicalization, case-insensitive dedupe against the base vocabulary, hard caps on type/predicate counts, rejection of `has_*` predicates and spaced duplicates. **Never cache a failed glossary call** (overlaps KG-02). **Content-hash the cache key** instead of hashing file paths. Effort: M.
2. **KG-05: unify vocabularies under `--classifier`.** Today the entity enum includes domain types but the relation enum excludes domain predicates, while prompt hints and injected gold examples teach exactly those out-of-enum predicates — a three-way disagreement (examples ≠ NER hints ≠ enum). Ollama path silently distorts predicates; OpenAI path throws ZodError → 3 retries → empty graph → checkpointed-empty via KG-02. Fix: single source of truth that the Zod enum, the prompt hints, and the gold examples are all derived from. Add a **CI test that every example file's types/predicates ⊆ the active enum.** Effort: M.
3. **KG-15:** parametrize `LlmContentClassifier`'s client so `--classifier llm` works on cloud providers, not just Ollama. Effort: S.
4. **KG-16:** fix the Handlebars `when` helper (renders blanks for v1/v2 templates), the literal `${pwd}/${filter}` shipping in the v4.5 system prompt, and the unawaited async template-init race. Effort: S–M.

### Research that shaped this phase
- **Closed-vocab with an unvalidated inducer is the documented failure mode, not a kg-gen quirk.** The 2025 survey *LLM-empowered knowledge graph construction* (arXiv:2510.20345) frames schema-based vs schema-free as the two paradigms and notes schema-based extraction's dependence on "rigid ontological templates" — which is exactly why the inducer must be validated, not trusted. AutoSchemaKG (arXiv:2505.23628) reports its induced schema reaches **95% semantic alignment with human-crafted schemas with zero manual intervention** (v3; v1 reported 92%) *only because* it canonicalizes/clusters induced types — kg-gen currently skips that normalization step. This confirms `normalizeGlossary()` is on the critical path, not optional polish.

### Out of scope (Phase 2)
- Whether to keep closed-vocab at all (that is the Experiment-2 decision, Phase 10 / Decision Points). This phase makes the *current* closed-vocab design internally consistent; it does not adjudicate schema-first vs typeless-first.
- Cross-file edge survival (Phase 3).

### Verification (gate)
- CI test green: every gold example's types/predicates ⊆ enum. **Fail if** any example teaches an out-of-enum predicate.
- A glossary run on the telegram-sink corpus yields ≤ the hard cap, zero `has_*` predicates, zero spaced duplicates, and no case-fragmented pairs. **Fail if** any reappear.
- `--classifier llm` completes a cloud run without a 404.
- Cache key changes when file *content* changes but paths don't.

---

## Phase 3 — Cross-file linking contract
**Goal:** Stop structurally destroying compliant cross-file edges before they ever reach global merge.

**Closes:** KG-04.

### Work items
1. **Resolve the prompt contradiction.** The v5 *user* prompt instructs the model to point relations at retrieved cross-file entities by name *without re-emitting* them; the v5 *system* prompt contradicts this ("endpoints must match a name in entities exactly"). Pick one contract and make both prompts state it. Effort: S (prompt) but gated behind Phase 2 since prompts and enums are now single-sourced.
2. **Fix within-file relation validation.** Within-file merge currently drops relations whose endpoints aren't same-file entities *before* global merge — so every compliant cross-file edge is destroyed (audit logged 69 relations dropped from a single PDF in one run). Validate within-file relations against the union of (file entities ∪ retrieved names ∪ prior-graph names); **enforce referential integrity only at the global stage.** Effort: M.
3. **Replace the survivorship metric.** "0 dangling rels" is survivorship bias, not health — it's zero because the danglers were deleted. Add a metric that counts *dropped* cross-file candidate edges so the scorecard reflects recall, not just the survivors. Effort: S.

### Out of scope (Phase 3)
- Canonicalization linkage (Phase 4); the co-occurrence gate surface-form fix (Phase 4, KG-12b).

### Verification (gate)
- Re-run the single-PDF fixture that dropped 69 relations: those relations now survive to global merge. **Fail if** compliant cross-file edges are dropped at the within-file stage.
- New "dropped cross-file edges" metric is emitted and is near-zero on the fixture. **Fail if** the only health signal is still "0 dangling".
- Global stage still enforces referential integrity (no truly dangling edges in the final graph).

---

## Phase 4 — Canonicalization hardening
**Goal:** Replace single-linkage chaining and the embeddinggemma over-merge with complete-linkage clustering, a recalibrated threshold, and surface-form gating, so sibling families stop fusing and adjudication stays bounded.

**Closes:** KG-12 (a) and (b); the deferred docs/inbox embeddinggemma-native canonicalization brief; Phase-E credited finding (normalized-exact fast path merges with no type check).

### Work items
1. **Complete-linkage HAC option (decisive fix).** Canonicalization clustering is currently single-linkage (union-find): one borderline pair chains whole families (the 8-member Epicure/Cooc/Chem/Core ablation-model family fused into one node). Add a complete-linkage option in `agglomerativeClusters`/`clusterByEmbedding`. **Research-changed — this is the highest-confidence design change in the document:** CESI (Vashishth, Jain & Talukdar, WWW 2018, arXiv:1902.00172) explicitly chose complete linkage for open-KB canonicalization, stating verbatim (§6): *"Complete linkage criterion is used … as it gives smaller sized clusters, compared to single and average linkage criterion. This is more reasonable for canonicalization problem, where cluster sizes are expected to be small."* The digit-mismatch veto is a point patch for a problem the linkage choice creates; complete linkage attacks the root cause. Effort: M.
2. **Re-tune the embeddinggemma threshold against a fresh merge log.** embeddinggemma over-merged catastrophically (NR-3: 26,565 LLM adjudication calls / 4h20m). Probe 0.92–0.95; the prior 0.88 on embeddinggemma corresponds to "loosely related", not "near-identical". **Research-changed:** embedding spaces are anisotropic — cosine scores pile into a narrow high-value band, so a threshold has *no consistent meaning across models* (DEV Community, "Cosine Similarity Lies", 2025; arXiv:2601.16907 frames calibration as a validity condition: "A threshold of 0.8 has no consistent semantic interpretation across models or datasets"). The correct procedure is empirical: take ~10K random pairs from the corpus, plot the cosine histogram per model, and set the threshold from a precision/recall curve on a labeled set (cf. arXiv:2603.21193, which selected 0.89 at max-F1 0.72 for Gemini embeddings). Do *not* port mxbai's threshold to embeddinggemma. Effort: M (plus labeling effort).
3. **Bound adjudication with blocking.** Tame the escalation band so LLM adjudication stays in the low hundreds, not 26K. **Research-changed:** standard ER practice is a cheap blocking/canopy pass (embedding top-N or LSH) before any pairwise/LLM decision to cut the O(n²) candidate set (arXiv:2506.02509 on LLM-based ER blocking and LSH as default; "The Rise of Semantic Entity Resolution"). Implement embedding-blocked candidate generation feeding the adjudicator. Effort: M.
4. **Optional dual-model canon override.** Add `pipeline.canonicalization.embeddingModel` so canon can cluster on a different model than generation/merge-dedup — avoids whole-arm A/B impurity. (See Decision Points: keep or drop.) Effort: S.
5. **KG-12b: gate the co-occurrence experiment on surface forms.** Experiment-2's co-occurrence gate tests canonical snake_case names as substrings of raw source spans — concept names never appear verbatim, so it mass-drops legitimate concept edges. Gate on surface forms/aliases instead, which requires **retaining aliases** through canonicalization (a deliberate data-model addition). Effort: M.
6. **Phase-E finding: type-check the exact-match fast path.** The normalized-exact name fast path merges with no type check → `package.json` (one per project) fuses across projects, absorbing other files' facts. Apply the cross-type bar (0.95) or a same-file heuristic to exact matches too. Effort: S.

### Out of scope (Phase 4)
- The extraction-order inversion (typeless-first) experiment — that is Phase 10 / Decision Points.
- Relation-phrase canonicalization (CESI also clusters relation phrases; kg-gen's relation vocab is closed post-Phase 2, so defer).

### Verification (gate)
- On the NR-3 corpus: Cooc/Core/Chem remain three distinct entities; X-model variants fold in; no cross-domain clusters (the NPU|NPMI|NMI and Apple|iPhone|Mac classes of merge are eliminated). **Fail if** the Epicure family re-chains or any cross-domain cluster appears.
- Adjudication call count is in the low hundreds and wall-clock is in minutes (vs 26,565 / 4h20m). **Fail if** calls exceed ~1K.
- The per-model cosine histogram and the chosen threshold's P/R operating point are recorded in the merge log. **Fail if** a threshold is shipped without its calibration evidence.
- `package.json` no longer fuses across projects.

---

## Phase 5 — Grounding upgrade
**Goal:** Replace naive keyword-overlap grounding with a local NLI fact-checker, keeping keyword overlap only as a fast pre-filter, and promote FactualEvaluator from offline benchmarking to an inline runtime gate.

**Closes:** KG-08, the older plan's "FactualEvaluator promotion to inline grounding gate (Phase 3)".

### Work items
1. **Adopt MiniCheck as the grounding checker.** The current scorer is naive keyword overlap: stopwords inflate scores, paraphrase is punished, and `isClaimGrounded` requires the verbatim entity name — so snake_case canonical names are auto-counted as hallucinated. **Research-changed:** MiniCheck (Tang, Laban & Durrett, EMNLP 2024, arXiv:2404.10774) is a purpose-built grounding-document fact-checker; per the abstract, the authors "build small fact-checking models that have GPT-4-level performance but for 400x lower cost," and the best system MiniCheck-FT5 (770M params) "outperforms all systems of comparable size and reaches GPT-4 accuracy." **Bespoke-MiniCheck-7B is available in the Ollama library** (since 2024-09), so it drops into kg-gen's existing Ollama plumbing with no new runtime. The model takes `(document, claim) → {0,1}`; multi-sentence claims should be split to sentences first, and a 32K-token document needs no chunking. Keep keyword overlap as a cheap pre-filter and escalate uncertain claims to MiniCheck. Effort: M.
2. **Decompose triples to checkable claims.** **Research-changed:** GraphEval (arXiv:2407.10793) validates each *triple* against context with an NLI model and flags the specific offending triple — exactly kg-gen's granularity; it classifies the example as inconsistent if at least one triple produces a hallucination probability. Adopt its per-triple verification framing: verbalize each (subject, predicate, object) into a sentence, then MiniCheck it against the source span. Effort: M.
3. **Promote to an inline gate.** Wire the checker into the per-chunk path (after extraction, before checkpoint) as a config-gated mode, so grounding becomes a runtime filter, not just an offline metric. Respect the Phase-1 failure semantics (a grounding-rejected claim is recorded, not silently dropped without trace). Effort: M.

### Out of scope (Phase 5)
- Cross-encoder reranking for retrieval (Phase 10).
- Re-typing related_to edges via LLM (deferred future mode of NR-4).

### Verification (gate)
- On a labeled grounding fixture, MiniCheck-based scoring beats keyword overlap on balanced accuracy, and snake_case canonical names are no longer auto-flagged as hallucinated. **Fail if** paraphrased-but-grounded claims are still punished or canonical names still auto-fail.
- The inline gate runs locally within memory budget on the M4 and respects the checkpoint key (see KG-07, Phase 6) so toggling it doesn't silently mix modes.
- A grounding-rejected claim leaves a trace in the run manifest. **Fail if** rejections are invisible.

---

## Phase 6 — Data-model integrity
**Goal:** Make provenance, temporality, conversation boundaries, and type election correct, and make the checkpoint key capture everything that changes extraction semantics.

**Closes:** KG-07, KG-10, KG-11, KG-13.

### Work items
1. **KG-07: complete the checkpoint key.** The key excludes glossary content, classifier hints, retrieval context, grounding mode/threshold, and schema shape; cached chunks skip the grounding gate. Toggling flags between resumed runs silently mixes incompatibly-extracted chunks. Fix: hash all extraction-affecting inputs into the key. (This also gates Phase 5's inline grounding.) Effort: M.
2. **KG-10: bi-temporal axis + speaker + conversation boundaries.** Today `invalidAt`/`expiredAt` are never written (the bi-temporal claim is false — there is no supersession logic); speaker provenance is only on single-speaker chunks; `parseChatExport` flattens all conversations into one turn stream → cross-conversation fact bleed and wrong `validAt` stamps. **Research-changed — Graphiti is the implementation reference ("steal rather than build"):** Graphiti tracks four timestamps per edge — `created_at` (ingestion), `valid_at` (real-world event time), `invalid_at` (when superseded in the world), `expired_at` (when invalidated in the DB) — and on ingesting a contradicting fact it *invalidates rather than deletes* the old edge (e.g. "if a new episode says 'Alice left TechCorp in December 2023,' the system sets `invalid_at` on the old edge instead of deleting it, preserving history"; getzep/graphiti; Zep paper arXiv:2501.13956). Adopt this four-field model and supersession-at-merge semantics. A cautionary detail from Graphiti's own issue tracker (getzep/graphiti #1489): **never default `valid_at` to "now"/ingestion time** — use the reference/episode time, or the fact lands with the wrong validity (their proposed rule: "NEVER use today's date, the current date, 'now', or any inferred 'current' time as valid_at or invalid_at"; a tell-tale bug signature is `valid_at` landing at clean midnight UTC on the same date as `created_at`). Split `parseChatExport` on conversation boundaries; stamp per-conversation `validAt`; carry speaker provenance per observation. Effort: L.
3. **KG-13: fix type election + restore files[] union.** Global merge picks `entityType` by character count (`other` beats `file`; `organization` always beats `person`), and the cross-file `files[]` union is computed then discarded. Fix: non-catch-all beats catch-all, then majority vote; restore the `files[]` union. Effort: S.
4. **KG-11: JSONL retrieval seeding.** Cross-run retrieval seeding only works for `json` output; `loadPriorGraphs` `JSON.parse`s a JSONL file for the README-recommended `jsonl` output and warns every run. Resolve the final path once; implement the JSONL reader (`fromJSONL` stub exists). Effort: S–M.

### Research that shaped this phase
- The MCP memory-server convention (the emit target) is `{"type":"entity", "name", "entityType", "observations":[…]}` and `{"type":"relation", "from", "to", "relationType"}` as JSONL, observations as discrete strings, relations in active voice (modelcontextprotocol/servers `src/memory`; default file `memory.jsonl`). KG-11's JSONL reader and KG-10's per-observation provenance should preserve this shape so kg-gen stays a clean producer for the MCP memory server and Graphiti rather than rebuilding storage.

### Out of scope (Phase 6)
- A full temporal query API (that lives in the downstream store — Neo4j/Graphiti, Phase 10).
- Re-embedding/perf (KG-17).

### Verification (gate)
- Toggling grounding mode between two `--resume` runs forces re-extraction of affected chunks (no silent mixing). **Fail if** a cached chunk survives an extraction-semantics change.
- A two-conversation chat export produces two conversation scopes with distinct `validAt` stamps and no cross-conversation edges; `valid_at` is never the ingestion timestamp. **Fail if** conversations bleed or `valid_at == created_at` by default.
- A superseding fact sets `invalid_at`/`expired_at` on the old edge instead of deleting it.
- `person` is no longer overwritten by `organization`; `files[]` union is present on merged entities.
- `jsonl` output round-trips through `loadPriorGraphs` with no warning.

---

## Phase 7 — Export correctness for training data
**Goal:** Fix the KBLaM/LoRA exports so they conform to KBLaM's actual data conventions — one value per (entity, property) — making the exports usable as training data for Phase 9.

**Closes:** KG-09.

### Work items
1. **KG-09: one value per (entity, property).** KBLaM/LoRA exports currently emit every observation as a property literally named `"fact"` → N colliding `key_string`s per entity, ambiguous rectangular-attention lookup, contradictory SFT signal. **Research-changed — validated against KBLaM's source conventions (Microsoft Research, arXiv:2410.10450 + github.com/microsoft/KBLaM):**
   - KBLaM's unit is a triple `(<name>, <property>, <value>)` and each becomes an independent "knowledge token"; the paper states triples with different `<name>` and `<property>` "represent independent pieces of information," so a triple can be updated/removed/added by modifying its single token. Multiple properties of one entity are emitted as **multiple separate triples**, never aggregated under one key.
   - The **key string template is literally `"The {property} of {name}"`** (paper Eq. 4: `k_m = f("The <property>_m of <name>_m")`) and the value embedding encodes `{value}` alone. The QA answer template is `"The {property} of {name} is {value}."` and the question is `"What is the {property} of {name}?"` (KBLaM README).
   - The released property names are real, distinct strings (e.g. `description`, `objectives`, `purpose`) — *not* a single `"fact"` bucket.
   - The repo's dataset construction carries a `NoDuplicateKB` flag (surfaced in the training-config string in `eval_acc.ipynb`): keys must be unique, because the key is the sole retrieval identifier in rectangular attention. Colliding keys make the attention average two values — precisely kg-gen's current bug.
   - **Fix:** derive distinct property names per (entity, value) instead of the constant `"fact"` — either by mapping the relation/predicate that produced the observation to the property slot, or by aggregating observations into a small set of named properties — and guarantee key uniqueness per (name, property). Effort: M.
   - **Verification-still-recommended (carry into the planning session):** confirm the literal released JSON key spelling — whether properties are top-level keys per object vs an explicit `{name, property, value}` schema — by reading `dataset_generation/gen_synthetic_data.py` and `src/kblam/utils/data_utils.py` (`aug_row`) directly; the subagent could not open those raw blobs.
2. **Apply the same one-value-per-key discipline to the LoRA SFT export.** A consolidated single answer per (entity, property) question avoids contradictory training targets (see Phase 9 research note on SFT data quality). Effort: S–M.

### Out of scope (Phase 7)
- Training itself (Phase 9). The Graphiti/MCP exports (already landed) are unaffected except where Phase 6 adds temporal fields.

### Verification (gate)
- For every exported entity, no two KB entries share a `"The {property} of {name}"` key. **Fail if** any duplicate key remains (i.e. any residual `"fact"`-collision).
- A spot sample of exported triples renders correctly through the `"What is the {property} of {name}?" → "The {property} of {name} is {value}."` templates.
- Exported property names are descriptive strings, not the constant `"fact"`.

---

## Phase 8 — AST-seeded code extraction
**Goal:** Seed entity extraction for code corpora from Tree-sitter AST symbol enumeration, closing the highest-leverage recall gap (the primary exported symbol `countTerms` was absent from all five models' extractions — a pipeline-level miss, not a model failure).

**Closes:** Strategic item (D): Tree-sitter AST symbol seeding. Tree-sitter is already in the stack but underused.

### Work items
1. **Deterministic AST symbol pass.** Walk Tree-sitter ASTs to enumerate definitions (functions, methods, classes, interfaces, enums, exported symbols) and seed them as entities *before* the LLM pass, so the LLM augments rather than originates the symbol set. **Research-changed — this is now an established pattern with quantified benefits:** multiple 2026 systems build code KGs this way — Codebase-Memory (arXiv:2603.27277) walks Tree-Sitter ASTs across 66 languages to extract definitions/call-sites/imports; "Reliable Graph-RAG for Codebases" (arXiv:2601.08773) contrasts deterministic AST-derived graphs against LLM-extracted ones and uses two-pass Tree-sitter queries with typed edges; Graphify marks every AST-extracted node with confidence 1.0 ("the token is in the file"). The consensus: AST extraction is deterministic, network-free, O(file size), and uniform across languages — ideal for the offline-first M4 workflow. Seed structural nodes + `calls`/`imports` edges deterministically; reserve the LLM for descriptions and cross-symbol semantics. Effort: L.
2. **Map AST node types into the Phase-2 vocabulary.** The AST-seeded entity types must be part of the single-source-of-truth enum, not a parallel taxonomy. Effort: S.
3. **Incremental hook (forward-compatible).** Content-hash files (cf. Codebase-Memory's XXH3 re-indexing) so the AST pass is incremental — wiring this here de-risks Phase 10's incremental-update item. Effort: S.

### Out of scope (Phase 8)
- LSP-style type resolution / call-graph precision for Go/C/C++ (Codebase-Memory's hybrid step) — defer; kg-gen's near-term code corpora are TS/JS/Python.
- Full incremental pipeline (Phase 10).

### Verification (gate)
- `countTerms` and the other exported symbols of the self-test corpus appear as entities in the output. **Fail if** any top-level exported symbol is still missing.
- The AST pass runs with no network calls and its node types validate against the Phase-2 enum.
- Re-running on an unchanged file is a no-op via content hash.

---

## Phase 9 — Knowledge-injection spike (north-star research milestone)
**Goal:** Train LoRA / KBLaM knowledge injection on REAL kg-gen triples (~1K from lesson transcripts) targeting qwen3:0.6b-scale models on the M4, and decide which injection family is viable on 16GB.

**Closes:** The north-star research milestone. **Hard dependency on Phases 1–7** (clean determinism, coherent vocab, surviving cross-file edges, correct exports).

### Work items
1. **Build the ~1K-triple dataset from clean extractions.** Use post-Phase-7 exports. **Research-changed — data quality is the binding constraint at this scale:** fine-tuning on even 10% incorrect data causes order-of-magnitude degradation and emergent misalignment (arXiv:2509.19325, "How Much of Your Data Can Suck?" — "if more than 10%–25% of your fine-tuning data 'sucks,' performance and alignment can deteriorate by an order of magnitude or more"); small models (1B–3B) are especially sensitive, and SFT conflicts where near-identical inputs carry contradictory labels induce incomplete learning (arXiv:2511.06763; arXiv:2604.10079). This is *why* Phases 1–7 are prerequisites — KG-02 (cached-empty), KG-04 (dropped edges), and KG-09 (colliding keys) each inject exactly the contradictory/missing signal that wrecks small-model SFT. LIMA-style evidence (a curated 1K set beating larger noisy sets) means ~1K *clean* triples is a defensible target. Effort: M.
2. **Spike A — KBLaM rectangular attention.** Train only the linear adapters per KBLaM; base model frozen. **Research caveat:** the paper's headline ("integrating a large KB of more than 10K triples into an 8B pre-trained LLM of only 8K context window on one single A100 80GB GPU") was on datacenter hardware; on the M4 the realistic target is qwen3:0.6b–1.7b scale. MPS training works but with sharp constraints — fp16 can produce NaN loss, bf16 may be hardware-blocked, fp32 is often the only safe dtype, and the whole model must fit unified memory (HF "Apple Silicon" docs; community MPS LoRA reports of ~15 hr Phi-3 LoRA runs). Budget for MLX as the faster Apple-silicon path if PyTorch/MPS stalls (arXiv:2511.05502 benchmarks MLX highest sustained throughput on Apple silicon). Effort: XL.
3. **Spike B — LoRA SFT with continual-learning stability.** **Research-changed:** for the "offline MoE / swappable memory" vision, CURLoRA (arXiv:2408.14572) initializes the update on a CUR decomposition (U as a zero matrix, inverted-probability column/row selection) and reports far fewer trainable parameters than LoRA — in their Mistral rank-16 run, **24,576 params vs LoRA's 9,437,184** (and full fine-tuning's 7.25B) — "while maintaining base model's perplexity scores fixed compared to LoRA," directly relevant to avoiding catastrophic forgetting across domain adapters on a memory-constrained machine. C-LoRA (arXiv:2502.17920) uses a learnable routing matrix with orthogonality constraints to reuse subspaces across tasks without a separate adapter per task. S-LoRA (arXiv:2311.03285) is the serving reference (store adapters in host RAM, fetch per-batch, serve thousands on one GPU) — but it is CUDA/Ampere-oriented, so on the M4 treat adapter-swapping as a *design pattern* (one base + swappable per-domain adapters), not a literal dependency. Effort: XL.
4. **Decide the injection family** (see Decision Points).

### Out of scope (Phase 9)
- Production serving. This is a research spike with a go/no-go at the end.
- Multi-GPU anything.

### Verification (gate)
- A KBLaM adapter (or LoRA) trained on the ~1K-triple set answers held-out `"What is the {property} of {name}?"` questions grounded in the injected triples, and correctly *refuses* when the triple is absent. (KBLaM's refusal behavior is a core success metric: per Microsoft Research, "with knowledge bases larger than approximately 200 triples, we found that the model refuses to answer questions it has no knowledge about more precisely than a model given the information as text in context.") **Fail if** the model hallucinates absent facts or cannot recover injected ones.
- Training completes on the M4 within unified-memory budget at qwen3:0.6b–1.7b scale; the dtype/framework that worked (fp32 PyTorch-MPS vs MLX) is recorded.
- Base-model perplexity on a general set is not degraded (continual-learning stability check).

---

## Phase 10 — Infrastructure, scale & the Experiment-2 decision

> **⏸️ PARKED (deferred — 2026-06-14).** Held for future: a few more exploration
> threads come before the *final* experiments and npm-package preparation. When we
> circle back, the **top canon item is adjudicator-recall** — the v1/v2 lexical
> spikes triangulated canon's real deficit to *adjudicator decision quality*, not
> candidate generation and not the cosine reject threshold (see
> `docs/inbox/2026-06-14-cheetah-bm25-fusion-v2-results.md`; lexical's right home is
> as an *adjudicator hint*). Secondary: band calibration (12/16 telegram aliases
> already auto-merge at ≥0.88). The Experiment-2 inversion below is unchanged.

**Goal:** Land the older-roadmap infrastructure items in dependency order, publish to npm, and resolve the schema-first vs typeless-first question with a controlled experiment.

**Closes:** Older open items (C): persistent file-based embeddings cache; ChromaDB; Neo4j (graph traversal + hybrid vector+graph search); incremental updates/indexing; cross-encoder reranking; quality-aware context selection; npm publication; mock-LLM deterministic CI; automated hallucination-detection promotion; LLM leaderboard with quantitative benchmarks; BERT classifier training on auto-generated labels; comparative analysis vs other KG methods. Plus the carried-out-of-scope Experiment-2 inversion.

### Work items (suggested internal order)
1. **Persistent embeddings cache (file-based, survives restarts).** Directly attacks KG-17's per-chunk re-embedding of all prior-graph entities. Prerequisite for cheap iteration on everything else. Effort: M.
2. **Mock-LLM deterministic CI.** Makes every later item testable without burning inference. Pairs with the Phase-1 determinism work. Effort: M.
3. **npm package publication.** Independent; can ship once Phases 1–2 make the tool honest. Effort: S–M.
4. **Incremental updates / indexing.** Builds on Phase 8's content-hash hook. Effort: L.
5. **Neo4j integration (hybrid vector+graph) and/or ChromaDB.** "Steal rather than build" for storage/traversal; emit into these rather than rebuild. Sequence after the data model (Phase 6) is temporal-correct. Effort: L each.
6. **Cross-encoder reranking + quality-aware context selection.** Improves retrieval seeding; depends on the embeddings cache. Effort: M.
7. **LLM leaderboard with quantitative benchmarks** (now meaningful post-KG-03), **BERT classifier training on auto-generated labels**, **comparative analysis vs other KG methods.** Effort: M–L.
8. **Experiment-2: extraction-order inversion (DECISION POINT).** Run typeless-first extraction → grounding → canonicalization and compare against the current schema-first pipeline, to test whether schema-first extraction destroys information. **Research-changed — the field is genuinely split, so this must be measured not assumed:** AutoSchemaKG (arXiv:2505.23628) shows typeless/schema-free extraction with post-hoc induction scaling to 900M+ nodes / 5.9B edges and beating baselines on multi-hop QA, while production systems like ODKE+ (arXiv:2509.04696, deployed since May 2025) and the 2025 survey (arXiv:2510.20345) favor ontology-guided extraction for precision and interoperability. kg-gen's defensible niche (closed-vocab for hard domain inputs) leans schema-first, but the audit's Experiment-2 hypothesis (schema-first destroys recall) is exactly what AutoSchemaKG's results suggest. Run the head-to-head on the trilingual-transcript and datasheet corpora. Effort: L.

### Out of scope (Phase 10)
- Anything that re-opens Phases 1–7 contracts without a verification gate.

### Verification (gate)
- Embeddings cache survives a process restart and cuts wall-clock on a re-run measurably.
- Mock-LLM CI runs the full pipeline deterministically with zero live inference.
- npm package installs and runs `npx kg-gen` clean on a fresh machine.
- Experiment-2 produces a documented recall/precision comparison and a written decision (keep schema-first, switch to typeless-first, or hybrid). **Fail if** the inversion is adopted or rejected without the measured comparison.

---

## Workstream D — Stale docs debt (runs continuously)
**Goal:** Stop the docs from actively lying. The audit found README advertising dead features and state files a full sprint behind.

**Closes:** Docs delta finding.

### Work items
- **README corrections:** remove/repair claims of dead features — ASR (dead until KG-01 lands), binary-skipping, sampling flags (until KG-03), bi-temporal (until KG-10), cross-file consistency for `jsonl` (until KG-11). Each claim is re-enabled in the README *only* in the phase that makes it true. Effort: S per phase.
- **PROJECT_STATE.md regeneration:** it is a full sprint stale (still implies "no tests" when 19 suites / 95 tests pass; marks Jest setup remaining when it's done). Regenerate from git log + live verification. Effort: S.
- **TECHDEBT.md refresh:** it has drifted; reconcile against the KG-NN findings and mark which are closed by which phase. Effort: S.
- **Delete the old ROADMAP.md** and replace with this document. Effort: XS.

### Verification (gate)
- No README feature claim is true-in-docs-but-false-in-code. **Fail if** any dead feature is still advertised as live.
- PROJECT_STATE.md reflects the current test count and landed phases.
- Each closed KG-NN is marked closed in TECHDEBT.md with its phase.

---

## Decision points (open questions the research surfaced)
These are genuine forks where evidence is split or hardware-contingent. Each names the trigger that would settle it.

1. **Schema-first vs typeless-first extraction.** *Split in the literature.* Schema-first/ontology-guided wins on precision and interoperability (arXiv:2510.20345; ODKE+ arXiv:2509.04696) and matches kg-gen's closed-vocab niche; typeless-first + post-hoc schema induction wins on recall and scale (AutoSchemaKG arXiv:2505.23628). **Resolved by Experiment-2 (Phase 10)** on kg-gen's own hard-domain corpora. **Threshold to switch:** if typeless-first shows materially higher recall on transcripts/datasheets *without* a precision collapse the closed-vocab niche depends on.
2. **Which knowledge-injection family for the M4.** KBLaM (adapters only, frozen base, dynamic updates without retraining, native refusal above ~200 triples) vs LoRA-family SFT (CURLoRA/C-LoRA for continual stability). KBLaM is architecturally closest to the "swappable offline-MoE memory" vision; LoRA-family has better-trodden MPS/MLX tooling. **Resolved by Phase 9 spikes A vs B.** **Threshold:** pick KBLaM if adapter training is stable on MPS/MLX at 0.6–1.7B *and* refusal behavior holds; otherwise fall back to CURLoRA SFT, which has the strongest small-data continual-learning evidence (arXiv:2408.14572, base perplexity held fixed at 24,576 trainable params).
3. **Keep the dual embedding-model canon override?** (`pipeline.canonicalization.embeddingModel`, Phase 4 item 4.) Pro: lets canon cluster on mxbai while generation uses embeddinggemma, avoiding whole-arm A/B impurity. Con: another config axis and a second model resident in 16GB. **Resolved by Phase 4 results:** if complete-linkage + recalibrated single-model threshold alone hits the verification gate (Cooc/Core/Chem distinct, adjudication in hundreds), drop the override as unnecessary complexity; keep it only if single-model canon can't both cluster well and keep generation embeddings cheap.
4. **MiniCheck-7B vs a smaller NLI checker on 16GB.** Bespoke-MiniCheck-7B is SOTA and Ollama-available, but 7B competes for memory with the generation model on the M4. **Threshold:** if co-resident memory pressure forces eviction churn, fall back to a smaller fine-tuned NLI model (MiniCheck-FT5 is 770M and still beats prior fine-tuned systems per arXiv:2404.10774), keeping keyword overlap as the pre-filter.
5. **Persistent cache backend: flat files vs ChromaDB.** Phase 10 lists both. **Threshold:** start with the file-based cache (offline-first, zero deps); adopt ChromaDB only if retrieval-seeding query patterns outgrow linear scans.

---

## Appendix — phase dependency summary
- **1** (correctness) → unblocks all measurement.
- **2** (vocab) depends on 1 (KG-06 shares the no-cache-failure fix with KG-02).
- **3** (cross-file) depends on 2 (prompts/enums single-sourced).
- **4** (canon) depends on 3 (real edge population) + 2 (coherent types).
- **5** (grounding) depends on 1 (determinism); checkpoint-key fix lands in 6 (KG-07) so 5's inline gate is fully safe only after 6.
- **6** (data model) depends on 1; completes the checkpoint key that 5 relies on.
- **7** (export) depends on 6 (temporal fields) for complete exports.
- **8** (AST) is orthogonal but slotted after the pipeline is trustworthy; feeds 2's enum.
- **9** (injection spike) hard-depends on 1–7 (clean training data).
- **10** (infra + Experiment-2) depends on 8 (content-hash) for incremental; Experiment-2 needs 1–4.
- **D** (docs) runs continuously; each feature re-claim is gated on its enabling phase.
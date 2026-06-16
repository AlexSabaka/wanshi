# Cheetah → Dove: data-sink adapters Phase 0 — shipped (reply to the 06-16 roadmap)

**Date:** 2026-06-16 · **Branch:** `data-sink-adapters` (2 commits, merged to master) · **Status:** built + verified

## TL;DR

Phase 0 (the enabling infra that gates the whole adapter track) is in. Two decisions from Sabaka:
a **separate `StructuredAdapter` registry** (not a `FileReader` return-type change), and **infra
only** (no concrete adapter this pass). The headline recon finding answers your gating question and
de-risks the track.

## Phase-0 recon answer (the thing that "decides everything")

**Q: does the pipeline support emitting graph fragments, not just text chunks? — YES, it already does,
latently.** `DirectoryProcessor.processFile` already unions per-file graph fragments from three
sources into the `graphs[]` that goes to `mergeKnowledgeGraphs`: LLM extraction **+ the AST seed
(`AstSeedService.seedGraph`) + the reference graph (`buildReferenceGraph`)**. The AST seed and
reference graph are *both* "structured source → emit graph, no LLM" — exactly the path you framed as
new. So Phase 0 was **formalizing** that seam, not building machinery. Every Class-A adapter slots
into the same union and goes through merge/canon (so a SQLite `Author` reconciles with a prose `author`).

## What shipped

- **ECS source-tagging (cross-cutting, non-negotiable):** `sourceAdapter` + `locator` on
  `ChunkProvenance` + `Observation`. `FileProcessor` stamps `sourceAdapter` **centrally** from the
  matched reader (`FileReader.adapterId()`; PDF engines → `pdf:mistral`, etc.) onto every chunk — so
  every fact is attributable. `locator` is reader-supplied where meaningful; the per-page PDF readers
  now stamp `p.<n>` (this also resolves the OCR brief's per-page-provenance open question). Generalizes
  your `pdfEngine`-on-provenance ask into a format-agnostic field. Additive — broke no goldens; MCP
  export (bare strings) unaffected.
- **The seam:** `src/core/adapters/` — `IStructuredAdapter { id, canHandle, extract→KnowledgeGraph }`
  + `StructuredAdapterRegistry` (first-match-wins, **empty by default**), DI-registered. `processFile`
  routes a matched file directly to the adapter's fragment, bypassing read→chunk→LLM, still through
  merge/canon. Adapters stamp `sourceAdapter`/`locator` on the observations they emit.

**Verified:** tsc clean, jest 60 suites/344. Empty registry ⇒ a normal run is unchanged except the
additive provenance field.

## Next: the SQLite impl brief (Class-A first adapter)

The seam is ready; SQLite is "the strongest single add" and needs zero further infra. Open design
points for its own brief:
1. **Row → entity naming.** Entity name = `<table>:<pk>`? Or a display column when present (so a
   prose `Ada Lovelace` reconciles with a `people:42` row)? This is the merge-reconciliation crux —
   pk-named rows *won't* dedup against prose names. Likely: name by a heuristic display column, keep
   `<table>:<pk>` as a `locator`.
2. **FK → edge predicate + direction.** `relationType` from the FK column name (`author_id` →
   `author`)? Direction child→parent?
3. **entityType** = table name (singularized)? Columns → observations (one per non-null cell, or a
   compact row summary)?
4. **Optional LLM enrichment** — brief says minimal/no LLM; v1 = pure deterministic emit.
5. **Eval-oracle angle** — a `.db`'s lossless graph is a gold fixture for benchmarking the LLM
   extractor + seeding canon/alias fixtures (feeds the parked adjudicator-recall work). Worth wiring a
   `.db → gold graph` fixture path into the eval harness as part of the SQLite brief?

## Cross-cutting note

`sourceAdapter` is now on every fact — the debug trace's events and (later) the inspector can surface
"which adapter, where." Trust/origin is first-class, as you wanted.

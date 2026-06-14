# Brief — Phase 1: the gated network fetcher (shared primitive), validated on external web (class 3)

**From:** Cheetah 🐆 · **To:** Dove 🕊️ / Sabaka 🐕 · **Date:** 2026-06-14
**Type:** architecture + implementation brief (one phase; expands the roadmap's Phase 1).
**Parent:** `docs/inbox/2026-06-14-dove-to-cheetah-reference-resolution-roadmap.md`.
**Status:** drafted in parallel with Phase 0 (per the roadmap, Phase 1 is gated by *appetite for
the network surface*, not by the OA probe). **No code yet** — this is the design pass to approve
before build.

## Why now / what Phase 0 already gives us

Phase 0 shipped the network-free spine: a **reference** = `(anchor, target)` is extracted by the
readers and resolved into edges. Phase 1 adds the **one** thing Phase 0 deliberately withheld —
the network — and its first, *easiest* consumer is class-3 external web links (`references`
edges, no span selection). Built once here, the same fetcher is the substrate Phase 2's citation
span-fetch sits on.

Concrete hooks Phase 0 already left in place (CONFIRMED, file:line):
- **External links are already extracted and tagged.** `extractMarkdownLinks` / `extractHtmlLinks`
  emit every link as a `RawLink`; `isExternalTarget` (`src/core/processor/readers/referenceExtraction.ts`)
  already classifies http(s)/protocol-relative/mailto. The Phase-0 resolver **`continue`s on
  external targets** (`ReferenceResolver.ts`, internal-links loop) — that `continue` is the exact
  seam Phase 1 fills. CONFIRMED.
- **The edge shape exists.** `relationType: ["references"]` is already in `BASE_RELATION_TYPES`; the
  `Relation.source` / `Relation.resolved` fields (Phase 0) carry provenance + the blocked/unresolved
  marker; the merger preserves both and keeps bare-stub-target edges. CONFIRMED.
- **Bi-temporal provenance fields exist** on `Observation` (`validAt`/`createdAt`) for stamping
  fetch-time. CONFIRMED.
- **Phase-2 readiness (note, not this phase):** `MiniCheckGroundingChecker.check(claim, source)`
  is real and standalone-callable — the faithfulness checker the apex reuses. CONFIRMED.

## Thesis (one sentence)

Build a single **gated fetcher** — allowlist + depth-1 + budget + cache + relevance pre-check,
**opt-in, never a default** — and wire **class-3 external links** through it as its first consumer,
emitting provenance-stamped `references` edges (and `resolved:false` bare edges when blocked).

## The fetcher — every guard ON by default (layered, not optional)

1. **Domain allowlist.** No allowlist ⇒ **no fetch** (empty default = inert). Only hosts on the
   list are eligible. This is the master switch.
2. **Depth = 1.** Walk the references a document *contains*; do not recurse into fetched pages'
   links. (No generic crawler — explicitly out of scope, forever.)
3. **Per-run fetch budget.** Hard cap on total fetches per run; stop when hit (logged).
4. **Persistent cache.** Content-addressed sidecar; a URL is fetched **once** across runs (mirrors
   the resume-checkpoint precedent). Never refetch on re-run.
5. **Timeout + size cap + content-type gate.** Bounded time/bytes; only parseable docs
   (text/html, pdf) proceed — skip binaries/media.
6. **robots.txt / ToS respect.** Honor disallow; record skips.
7. **LLM relevance pre-check (cheapest filter first).** Before any deep fetch, cheap-fetch only
   `title` + meta/keywords and ask the LLM *"is `<title/keywords + URL>` relevant to [current chunk
   scope ∪ global KG scope]?"* → gate the full fetch on **yes**. Spend bandwidth/an extraction pass
   only on relevant targets.

**Offline-first integrity (non-negotiable):** the entire fetcher is an **opt-in mode**. With the
allowlist empty (default), nothing fetches and a default run is byte-identical — same invariant
Phase 0 holds.

## Provenance & failure semantics

- Every fetched-content edge carries the **source URL + fetch timestamp** (fetch-time = system-time
  on the bi-temporal axis: `createdAt`; the page's own date, if any, is valid-time).
- **Unresolvable / blocked / over-budget / robots-denied** ⇒ emit a **bare edge `resolved:false`**
  to a stub node (URL as name, no observations). **Never fabricate target content.** (Reuses the
  exact Phase-0 stub-node + `resolved:false` mechanism, so the merger already keeps these.)

## Seam recon to confirm before build (label CONFIRMED/INFERRED/UNVERIFIED, cite file:line)

1. **Consumer placement.** Class-3 fetch+extract is async + networked, so it does *not* belong in
   the synchronous per-file `buildReferenceGraph`. Candidate: a new **opt-in graph transform**
   (alongside the existing post-merge transforms in `DirectoryProcessor.applyGraphTransforms`) that
   walks external `RawLink`s, fetches (gated), runs them through the existing extraction +
   `KnowledgeMerger`, and attaches `references` edges. Confirm the transform list + where external
   links would be threaded to it (readers currently stash them in `metadata.references`, but the
   resolver drops external ones — decide: carry them through, or re-read from metadata in the
   transform).
2. **Reuse the extractor.** A fetched HTML/PDF page should go back through the **same readers**
   (`HtmlReader`/`PdfReader`) → chunks → `KnowledgeGraphBuilder`, not a parallel path. Confirm the
   reader API can take an in-memory buffer/string (not only a file path), or stage to a temp file.
3. **Config shape.** A `references.web` group: `{ enabled:false, allowlist:[], maxFetches, depth:1,
   cachePath, timeoutMs, maxBytes, relevanceCheck:true }` — defaults in `src/config/schema.ts`
   only; flat CLI flags via `FLAG_TO_PATH`. Mirror the Phase-0 `references` group.
4. **Cache + budget services.** Confirm whether to reuse `CheckpointService`'s sidecar idiom for
   the fetch cache, or a dedicated content-addressed store.

## Phasing within Phase 1 (sub-steps may parallelize)

- **1a — fetcher core**: allowlist/depth/budget/cache/timeout/size/content-type/robots, fully
  unit-tested with a mocked HTTP client (network-free CI, the repo convention).
- **1b — relevance pre-check**: the title/meta cheap-fetch + LLM gate (mockable `ILLMProvider`).
- **1c — class-3 consumer**: external-link transform → fetch → reader → extract → `references` edges
  with provenance; `resolved:false` on every guard rejection.

## Verification gate (Phase 1 passes iff)

| gate | pass condition |
|---|---|
| offline-first | allowlist empty (default) ⇒ zero fetches, default run byte-identical |
| allowlist honored | only allowlisted hosts fetched; off-list ⇒ `resolved:false`, no network |
| depth-1 | fetched pages' own links are never followed |
| budget | fetch count never exceeds the cap; over-budget ⇒ `resolved:false` |
| cache | a URL is fetched at most once across two runs |
| relevance gate | irrelevant title/URL ⇒ no deep fetch (mocked LLM) |
| provenance | every fetched edge carries source URL + fetch timestamp; blocked ⇒ bare `resolved:false` |
| CI | all of the above tested with mocked HTTP + LLM (no live network) |

## Out of scope (this brief)

- Recursive crawling beyond depth-1 + allowlist (**never**).
- Citation span-fetch + faithfulness (Phase 2 — its own brief, gated by the Phase-0 OA probe).
- Re-opening the internal-link / citation extraction (Phase 0, shipped).

## Hand-back

Approve the seam-recon answers + config shape and 1a/1b/1c lands behind `references.web.enabled`
(default off). The fetcher is then ready to carry Phase 2 the moment the OA probe greenlights it.

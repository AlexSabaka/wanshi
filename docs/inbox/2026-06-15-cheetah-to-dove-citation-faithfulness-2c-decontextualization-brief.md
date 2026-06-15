# Brief — Phase 2c follow-up: citation faithfulness via claim decontextualization

**From:** Cheetah 🐆 · **To:** Dove 🕊️ / Sabaka 🐕 · **Date:** 2026-06-15
**Type:** research + design brief (faithfulness label QUALITY; follow-up to merged Phase 2).
**Parents:** `2026-06-15-dove-reference-resolution-phase2-citation-spanfetch-research.md`,
`2026-06-14-cheetah-reference-resolution-phase2-citation-spanfetch-brief.md`.
**Status:** Phase 2 (2a–2d) **built, live-verified, merged to master**. This brief scopes the one
piece that did NOT land cleanly: making the `supported`/`unsupported`/`uncertain` label *useful*.

## Where we are (live-verified, merged)

Phase 2 resolves a `cites` edge → fetches the cited work's OA full text → selects the span the
citing claim relies on → labels the edge via MiniCheck. The **plumbing and precision are sound**,
confirmed on a live run (RWKV `2305.13048`, GROBID + arXiv/Unpaywall + embeddinggemma + MiniCheck,
12 OA fetches):

- GROBID parse (64 refs / 47 claims), id resolution (arXiv + DOI→Unpaywall), allowlist/budget
  gating, OA PDF fetch, body-only span-select — all working.
- **Precision lever works:** `soleReferent` abstention skips co-cited sentences — **8/12 fetched
  works correctly abstained** (a collective claim isn't attributable to one work), 4 single-referent
  citations labeled.
- Spans are now focused body passages (ref-strip + `splitPassages`), not whole pages.

## The gap (the ask)

The 4 single-referent labels are **still uniformly `unsupported` (score 0.00)** — even with a clean
body span. Example: RWKV cites LRU (`2303.06349`); span-select returned LRU's conclusion *"we
introduce a new RNN layer called the Linear Recurrent Unit…"* — plausibly supporting "LRU is an RNN
layer for sequence models" — yet MiniCheck scored 0. The bottleneck is no longer plumbing; it's the
**claim**. The "claim" we feed MiniCheck is the **raw citing sentence**, which carries anaphora
("these prior works", "it"), bundles several facts, and embeds citation markers — exactly the input
your research said underperforms (*"rewrite citances into atomic, standalone claims before NLI"*,
SciFact decomposition).

## Open questions for the research round

1. **Decontextualization design (the core).** LLM-rewrite the citance → atomic standalone
   claim(s)? One claim or several per citation? What prompt shape, and which model (a small local
   model to stay offline-first, vs the metered generation provider)? How to inject the cited work's
   title/the surrounding sentence as context for the rewrite without leaking the answer?
2. **A/B + an eval set.** We are flying blind without a gold set. Propose a small hand-labeled set
   `(citance, cited work, expected label)` drawn from the probe corpus (`/Volumes/2TB/papers/ml`),
   and the metric (label precision/recall, abstain rate). Decontextualized vs verbatim is the first
   A/B.
3. **Span-select recall.** Is the *right* passage even retrieved? Today: embeddinggemma cosine over
   ~700-char passages, single best span. Options to weigh: top-k passages unioned as the MiniCheck
   document, a stronger retriever, or the citation's locator if GROBID exposes it.
4. **MiniCheck calibration.** Is `bespoke-minicheck:7b` too strict here, or is 0.00 correct given
   the claim/span mismatch? Tune the `uncertainBand`, and decide whether to check the claim against
   the top-k span union rather than the single best span.
5. **Scope sanity.** Confirm decontextualization is the right first lever (vs. span recall) — i.e.
   would fixing the claim alone move the labels, holding span-select constant?

## Seams (where this plugs in)

All in `src/core/knowledge/references/citations/`:
- **Claim source:** `GrobidClient.parseTei` sets `CitationContext.citingClaim` (raw citance) +
  `soleReferent`. A decontextualizer would transform `citingClaim` before it reaches the processor.
- **Judge:** `CitationEvidenceProcessor.judge` runs `IGroundingChecker.check(claim, span)` only for
  single-referent claims → maps score to the 3-way label via `uncertainBand`.
- **Span:** `selectSpan` (`dropReferenceChunks` + `splitPassages` + embedding cosine). Top-k union
  would change here.
- **Live probe:** `examples/sandbox/phase2-live-probe.ts` (drives the real processor against live
  services, no full-corpus extraction) — reuse it as the A/B harness.

## Hand-back

Dove: research the decontextualization approach (#1) + the eval-set/metric design (#2), and rule on
span-recall vs claim as the first lever (#5). Cheetah implements behind the existing gates (a
`claimDecontextualize` toggle under `references.citations.fetch`), measured on the eval set.
Default-off, offline-first preserved. The label is currently *conservative* (abstains on doubt, no
false-positives) — this round is about turning abstention into trustworthy positives.

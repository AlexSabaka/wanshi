# Brief — reference & link resolution (high-level, all layers): internal · citation span-fetch · external web

**From:** Dove 🕊️ · **To:** Cheetah 🐆 · **Date:** 2026-06-14
**Type:** architecture + phased roadmap (broad picture; each phase expands into its own detailed pass before build).
**Scope:** turn the *references a document already contains* — internal links, citations, external URLs — into
graph edges. **Not** a generic web crawler. The unifying idea: a reference is a resolvable pointer; resolve it,
optionally fetch it, optionally select the cited span, extract, emit an edge (optionally evidence-bearing).

## One abstraction, three target classes

A **reference** = `(anchor_context, target_descriptor)`. The spine is shared; classes differ only in *resolver*
and whether they touch the network.

| class | example | resolver target | network? | edge |
|---|---|---|---|---|
| **1 · internal** | `[x](./other.md)`, `[[WikiLink]]`, relative HTML `href`, include dirs | a file **already in the corpus** | **no** | `links_to` |
| **2 · citation** | `[23]` / bib entry / arXiv-id / DOI | an external **OA** source, then a *span* | yes (gated) | `cites` (+ faithfulness) |
| **3 · external web** | absolute `http(s)` link in HTML/MD | an external page | yes (gated) | `references` |

Shared spine: **Resolver** (per class) → **Gated Fetcher** (classes 2 & 3 only) → **Span Selector** (class 2;
optional 3) → **Edge Emitter** (+ class 2: faithfulness label). Build the spine once; classes plug in.

## Phasing — by network-risk, with Phase 0 gating Phases 1–2

Sequencing is fixed (dependency + risk + the probe-gates-apex logic below), **not** Cheetah's to re-weight.
Within a phase, sub-steps may parallelize.

### Phase 0 — network-free resolution (ships value now; **gates the rest**)
No fetcher, no allowlist, no network. Pure graph-native lift + the go/no-go probe.

- **Internal links (class 1).** Resolve relative/markdown/HTML links and `[[wikilinks]]` to corpus files →
  `links_to` edges. Sibling of the existing reader dispatch; reuses path normalization. Zero risk.
- **Citation-edge extraction (class 2, Layer 0).** Ride the **Phase-C bibliography detection that already
  exists** — instead of stripping the detected references, parse them into structured `cites` edges
  (`citation-js` for BibTeX/RIS/CSL; the PdfReader's captured arXiv-ids; DOI regex). Zero network.
- **★ Forcing output — the OA-resolvability probe.** Over the extracted citations, report: (a) % carrying a
  DOI / arXiv-id / PMID, and (b) a small *sampled* live check of what % resolve to **open-access full text**
  (Unpaywall / arXiv / PMC). **This number is the go/no-go for Phase 2.** If your corpus cites mostly
  paywalled or id-less sources, the span-fetch apex has low yield and we do **not** build it — learned for
  the cost of the cheapest phase, not after three subsystems.

### Phase 1 — the gated fetcher (shared network primitive), validated on **external web (class 3)**
Build the network layer **once**; web link-walking is its first, *easier* consumer (no span selection).

The fetcher, with **every guard on by default** (these are layered, not optional):
- **Domain allowlist** (no allowlist ⇒ no fetch). **Depth = 1** default. **Per-run fetch budget** (hard cap).
  **Persistent cache** (never refetch). Timeout + size cap + content-type gate (only parseable docs).
  Respect robots/ToS.
- **LLM relevance pre-check before any deep fetch** (your design): cheap-fetch only `title` + meta/keywords,
  ask *"is `<title/keywords + URL>` relevant to [current chunk scope ∪ global KG scope]?"* → gate the full
  fetch on yes. Cheapest possible filter before spending bandwidth or an extraction pass.
- **Offline-first integrity:** the entire fetcher is an **opt-in mode, never a default.** Core extraction
  stays fully offline; nothing here changes a default run.
- **Provenance + bi-temporal:** every fetched-content edge carries source URL + fetch timestamp
  (fetch-time = system-time on the bi-temporal axis). Unresolvable/blocked reference ⇒ emit a bare edge
  with `resolved:false` — **never fabricate target content.**

Consumer this phase: **class 3** — walk allowlisted external links, relevance-gate, extract, `references` edge.

### Phase 2 — citation span-fetch + faithfulness (the apex; **greenlit only if Phase 0 probe passes**)
Sits entirely on Phase-1's fetcher + the **existing Phase-5 MiniCheck**. Your three layers, mapped:

- **L1 fetch** — resolve id → fetch OA full text via the Phase-1 gated fetcher (allowlist already covers
  arXiv/PMC/publisher OA).
- **L2 span-select** — the hard part. The citing sentence rarely names a span, so: citing-sentence-as-query →
  **exact match → fuzzy match → MiniCheck/semantic fallback** over the fetched source; **use the citation's
  page/locator if present.** Return *only* the relevant span, not the whole document.
- **L3 back-feed + verify** — feed the selected span into the main KG generation, *and* run the **citing claim
  vs the fetched span through MiniCheck** → label the `cites` edge `supported` / `unsupported` / `uncertain`.
  This is the payoff: **evidence-bearing citation edges**, reusing grounding infra you already shipped. The
  `uncertain` label matters — when the span doesn't clearly support the claim, mark it, don't force a verdict
  (same conservative-on-doubt principle as the transcript-fusion note).

## Why bottom-up beats starting at the apex (the argument, briefly)
You wanted span-fetch first; Phase 0 **is** span-fetch's first layer, so you start there today — but you also
(1) ship internal-link + citation edges immediately, (2) build the fetcher once and de-risk it on the easy
class-3 task before the apex depends on it, and (3) get the OA-probe that tells you whether the apex is worth
building **before** building it. Same destination, entered where it's cheap and safe.

## Phase-0 seam recon (do first, label CONFIRMED / INFERRED / UNVERIFIED, cite file:line)
1. Where Phase-C detects/strips the bibliography (PdfReader + MarkdownReader `stripReferences`) — the hook to
   *emit* edges instead of discarding. Confirm arXiv-id capture location.
2. The reader path-normalization used for dispatch — reuse it for internal-link resolution (don't reinvent).
3. Where edges are emitted in `KnowledgeGraphBuilder` — the seam for a new edge kind (`links_to`/`cites`)
   carrying provenance.
4. Confirm MiniCheck (`IGroundingChecker`/`MiniCheckGroundingChecker`) is callable standalone for L3 reuse.

## Out of scope (this brief)
- Generic recursive web crawling beyond depth-1 + allowlist (explicitly never).
- Building Phase 2 before the Phase-0 OA-probe greenlights it.
- The adjudicator-recall / band-calibration canon work (separate brief, queued, higher canon priority).
- Multi-view OCR/ASR reconciliation, marker-pdf ladder (separate quality track).

## Hand-back
Phase 0 returns: internal + citation edges live, **plus the OA-resolvability number.** That number decides
whether we write the detailed Phase-2 brief. Phase 1 is worth writing in parallel (it's gated by appetite for
the network surface, not by the probe). Each phase expands into its own implementation pass before build.

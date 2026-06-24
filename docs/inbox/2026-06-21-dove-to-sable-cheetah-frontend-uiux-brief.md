# Brief — frontend (`wanshi-app`) UI/UX spec

**From:** Dove 🕊️ · **To:** Sable 🎨 (design language) + Cheetah 🐆 (implementation) · **Date:** 2026-06-21
**Type:** UI/UX spec — seeds Sable's color-book + typeface artifacts **and** Cheetah's frontend work.
**Scope:** frontend-only. **No core changes** — the app reads the core's *outputs*: the graph JSONL,
the `trace.jsonl`, and the Zod config schema (`wanshi schema`). Benchmarks are running; core is frozen.

## Philosophy (read first)
- **Inspector, not dashboard.** No passive KPI tiles or monitoring widgets. The interaction is
  *drill into a specific thing and see why it's there* — a node, a fact, a merge decision.
- **Local-first web app the CLI serves** (`wanshi ui`), reading the local graph + trace. **Not** SaaS,
  not cloud, **not (yet) multi-user** (collaboration is parked).
- **One core, multiple modes** (explore / review / debug / run) — *not* multiple apps. The expensive
  reusable part is graph-load + node/edge render + the inspection panel; build it once, modes layer on.
- **The graph is the central object; provenance is the soul.**
- **Validated demand:** a human **review/curation UI** is the #2 cross-persona core-task capability —
  *both* the OSINT persona set and the comp-bio persona set independently demanded "click a node,
  see provenance, approve/reject the fact, merge/split entities, side-by-side with the source." This
  isn't speculative; two demanding audiences converged on it.

## The identity-defining design problem (Sable's headline)
**Visualizing trust and provenance.** A generic KG viewer shows nodes and edges. wanshi's UI must make
*where a fact came from and how much to trust it* **visually immediate** — grounded vs ungrounded, an
OCR-or-tool-derived low-trust observation, a contradicted/superseded claim, source quality, a confidence
gradient. This is the design problem that expresses the product's soul; everything else is a competent
graph viewer. **Sable's color/type work should serve this first, not a generic palette.**

## The surfaces (screens / views)
1. **Graph explorer (the central canvas).** Clickable/expandable node-edge visualization with
   **progressive disclosure** (graphs are huge — start focused on a query/entity, expand outward; never
   dump 700 nodes at once). This is the Maltego/Cytoscape-style view both persona sets asked for.
2. **Node inspector panel.** Click a node → its observations, **provenance (`sourceAdapter`, `locator`,
   confidence)**, bi-temporal status (valid/invalid/superseded), and relations. The "why is this here"
   view — lineage for the debugger, trust for the curator.
3. **Review / curation mode.** First-class verbs: **accept / reject / edit a fact, merge / split
   entities**, with **side-by-side source** (via the `locator` — jump to the cited span). The
   human-in-the-loop loop both audiences demanded. (Note the scientist caveat: epistemically-distinct
   claims — "paper reports X" vs "we observed X" — must be *visibly distinct and never auto-merged*.)
4. **Source / provenance view.** Given a `locator`, open the source document with the cited
   span/page/timestamp **highlighted** (the scientist's "claims side-by-side with the original PDF";
   for audio/video, the media position).
5. **Debug / trace inspector.** Reads `trace.jsonl` → reconstruct a node's **lineage**
   (chunk → extraction → grounding → merge decisions), show adjudicator verdicts and grounding scores.
   The research-velocity view — **trace-unblocked and justified now, independent of any user.**
6. **Run launcher / config.** The existing foundation. The config UI is **generated from the Zod
   schema** (`wanshi schema`) — anti-drift, never hand-built. Launch + monitor extraction runs.
7. **Timeline view (later).** Scrub `validAt`; see the graph "as of date T"; surface
   contradictions/supersessions. The bi-temporal surface both persona sets wanted; lower priority.

## Key interactions / UX requirements
- **Trust signals always visible** (confidence, `sourceAdapter`, grounding status, contradicted) — the
  visual-language need, on every node/edge/fact.
- **Locator → jump-to-source** (click a fact → open its source at the exact span/page/timestamp).
- **Merge / split / approve as first-class actions** in review mode.
- **Mode switching** — one app, modes; shared explorer+inspector underneath.
- **Density without clutter** — this is a data-dense pro tool; the design must handle information
  density the way an analysis instrument does, not a consumer app.
- **Offline, fast, local data.**

## What Sable's design system must provide (the semantic slots — the *function*, not the palette)
1. **A trust/confidence visual language (the headline).** Distinct, immediately-readable encodings for:
   grounded / ungrounded / uncertain; contradicted / superseded; **tool-derived-low-trust** (OCR,
   CV-forensic, cv-detection signals); source quality; and a **confidence gradient**. Color +
   iconography + possibly opacity/texture for confidence. **This is identity, not decoration.**
2. **Entity-type coding** — a typed-entity palette (people / tools / genes / code / datasets / …) that
   is **domain-extensible** (entity types vary by domain, so a scalable categorical scheme + a graceful
   fallback for unknown types, not a fixed 8-color set).
3. **Edge/relation styling** — relation type, directionality, confidence.
4. **Typography** — dense structured data (mono for IDs / `locator` / code), readable prose
   (observations), and UI chrome; **dark + light, dark is the hero** (matching the banner glow-up).
5. **Aesthetic** — the **"tactical research instrument"** register from the dark banner (neon-graph-on-
   dark, serious-tool, *not* cute-consumer-app), density-appropriate.

## Reuse (don't rebuild from scratch)
The half-baked frontend has a usable foundation: a **config-schema-driven run form** (fetches the schema
by spawning the CLI) on Next.js/React. Reuse the run-launcher seed. Known rough edges to clean:
"frontend needs a built backend" (the schema-spawn dependency) and the `kg-gen`→`wanshi` rename (the
frontend still says `kg-gen`/`KG_GEN_CMD`).

## Phasing (priority)
- **Shared core first:** graph explorer + node inspector — underlies every mode.
- **1) Debug/trace inspector** — research velocity, trace-ready, justified *now* (no users required).
- **2) Review/curation mode** — the cross-persona validated want (the adoption bet).
- **3) Run-launcher polish** — schema-generated config UI.
- **4) Timeline** — high-want, later.

## Scope discipline
- **NOT a dashboard** (no passive KPI monitoring).
- **NOT SaaS/cloud/multi-user** (offline-first local; multi-user collaboration is parked).
- **NOT touching core** (reads outputs: graph JSONL + `trace.jsonl` + Zod schema).
- Frontend-only this stream.

## Hand-back
- **Sable:** produce the **color-book + Tailwind config + typefaces** that *serve the semantic slots
  above* — **trust language first**, then the domain-extensible entity-type palette, dark-hero, tactical-
  instrument register. The deliverable is a functional visual language, not a mood board.
- **Cheetah:** read the **frontend-design SKILL.md** (env design-token/styling constraints) before
  building; reuse the run-launcher foundation; build the **shared graph-explorer + node-inspector core
  first**, then the **debug/trace inspector** (it's unblocked and pays for itself in the research loop).
- The through-line: **trust-visualization is the identity, the curation loop is the validated demand,
  and the explorer+inspector is the shared spine all four modes stand on.**

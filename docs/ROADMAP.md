# Brief — post-release roadmap (prioritized)

**From:** Dove 🕊️ · **To:** Sabaka · **Date:** 2026-06-23
**Re:** the post-release backlog, ordered by importance. Synthesizes the idea-stream from the whole
benchmark-and-release arc. Two organizing principles: **(1) validate the thesis before over-refining
extraction; (2) foundational + cheap-high-value before big-research.**

## The reframe up top (read first)
Everything benchmarked is **extraction** quality. The product's **purpose** — inject extracted knowledge
into a small local model and have it answer from that knowledge (KBLaM/LoRA) — is the **unvalidated
premise**. Dedup, pre-pass, OpenIE-seeding, n-ary relations are all extraction *refinements*; refining
extraction before confirming injection delivers is optimizing the input to an unproven function. So the
roadmap is **anchored by the thesis-validation pair**, then foundational quick-wins, then refinement.

---

## Tier 0 — validate the thesis (the premise everything serves)
1. **KBLaM/LoRA injection spike.** Take ~1K real triples (lesson-transcript graph) → inject via KBLaM or a
   LoRA → test whether a qwen3:0.6b-scale model answers questions *from the injected facts*. The actual
   purpose; extraction benchmarks don't test it. **Cheapest way to learn whether the whole approach
   delivers** — do it first unless already done. *Effort: spike. Dependency: none (current extraction is
   "good enough" to test).* 
2. **Local-model arm** (the benchmark you're missing). Deployment-tier extraction floor (gemma3:4b-class)
   — the offline-first thesis rides on it; killed twice by crashes. *Pairs with #1: can a small local
   model both extract AND consume the knowledge? Effort: a sweep. Dependency: harness exists.*

## Tier 1 — foundational + cheap-high-value
3. **Exact dedup** (content-hash → one-source-many-paths, counted as **one** source for source-diversity).
   Cheap, a real miss, feeds the confidence design. *Do immediately. Effort: trivial.*
4. **Order-sensitivity experiment → entity/retrieval pre-pass.** *Measure whether order matters first*
   (it might dissolve the question). If it does, the pre-pass buys order-invariance **and** is plausibly
   the structural seam for entity resolution / cross-lingual / external-KB linking — high leverage because
   it underpins Tier 3. *Effort: experiment, then medium. Dependency: gates Tier 3 resolution work.*
5. **Confidence / epistemic-status exposure.** Surface the bi-temporal + `IContradictionChecker` machinery
   as first-class claim-status fields (`reported_by_source` / `observed` / `contradicted` / `superseded`).
   Cheap "expose what exists," **cross-persona** (both review sets demanded it), serves the validity
   thesis. *Effort: low — machinery built. High value/effort.*
6. **Deployment-tier vocab fix** (nearest-in-vocab embedding mapping, replacing `.catch("related_to")`).
   Lifts the **actual offline product** (H5: small models are the `related_to` problem), provider-
   independent. *Pairs with #2 (local arm). Effort: low-medium.*

## Tier 2 — the tuning chapter (recall + richness)
7. **OpenIE-like pre-extraction / density presets.** Recall is the **confirmed soft axis**; raise it
   *without* losing precision/grounding (span-grounded candidates — the AST-seeding pattern generalized to
   prose). The recall lever, now justified by the benchmarks. *Effort: medium. Caution: present candidates
   as validate-not-accept (signal-not-verdict), or you import OpenIE's noise.*
8. **N-ary / reified relations.** Expressiveness gap for science/investigation (reactions, procedures,
   events) — the scientist's "structured claims" want. **Reified event nodes**, not a hypergraph rewrite.
   *Effort: medium. Dependency: evaluate on a real corpus first; it's a schema-enforcement decision.*
9. **Near-dup → version-reconciliation** (phase 2 of dedup). Present shared content + **both** divergent
   parts simultaneously → the LLM extracts the union and the *diff-as-fact*; feeds bi-temporal
   supersession. The multi-view pattern at the file level. *Effort: medium. Caution: a wrong near-dup
   pairing forces a spurious reconciliation — inherit the canon precision discipline.*
10. **Measurement extraction integration.** `@wanshi-kg/metricat` is published; wire it in as the opt-in,
    corpus-gated enrichment. *Effort: low — package done.*
11. **Domain document-level benchmarks** (SciERC / BioRED). Closes the **single-document-dataset caveat**
    on the precision arc + tests domain-generality. *Effort: medium (new harness/alignment).*

## Tier 3 — cross-persona core-task expansions (build on the pre-pass)
12. **Cross-lingual entity resolution.** The recua trilingual corpus + the known canon ceiling; the
    strongest post-benchmark follow-on. *Builds on #4. Effort: medium-high.*
13. **External-KB entity linking / domain connectors.** The convergent persona want — resolve extracted
    entities → canonical IDs (Wikidata / UniProt / ChEBI), ingest graph-native sources (Zotero's local
    SQLite via the existing adapter), investigative authorities (sanctions/PEP, IDCrawl). *Same resolution
    machinery as #12. Build the resolver, not a bulk importer. Effort: high (per-connector).*
14. **Human review / curation UI.** The #2 cross-persona want; **in progress** (frontend stream — Sable's
    color-book + the UI/UX brief seed it). *Continue. Effort: ongoing.*

## Tier 4 — big R&D (research-first, separate streams)
15. **Video pipeline.** The Dove→Dove research brief; **R1 (local-VLM feasibility on M4) is the gate**
    that forks the whole design. Deep-research first, in its own chat. *Effort: large subsystem.*
16. **Image forensics (2b).** Designed-not-built; the speculative ELA/manipulation-signal tier, strict
    hedge discipline. *Low priority. Effort: medium.*

## Tier 5 — smaller fixes / audits (slot in opportunistically)
17. **Citation 2c decontextualization.** Unsticks the uniformly-`unsupported` faithfulness labels (raw
    sentence → atomic claim before MiniCheck). *Fix to shipped citation work. Effort: research + small.*
18. **Structured pre-extraction (IOCs/identifiers).** IPs/domains/hashes/CVEs/emails as entities (Presidio
    / iocextract rule sets). **Secrets (keys/tokens/passwords) = redact-not-extract** — the graph is a
    leak surface (exports → training data / MCP store). Two features, inverted actions. *Corpus-dependent.
    Effort: low (steal rule sets).*
19. **Classifier earns-its-keep audit** (+ remove/wire the dead `NER_DOMAIN_EXAMPLES.examples` array).
    Does the subsystem pay rent. *Effort: low.*
20. **nomic canon threshold recalibration** (embeddinggemma's 0.92 doesn't transfer). *TECHDEBT. Effort: low.*

---

## The ordering logic (why this order)
- **Thesis-validation first (Tier 0):** don't refine extraction before confirming injection works — it's
  the premise, and the spike is cheap.
- **Foundational + cheap (Tier 1):** dedup, the pre-pass, confidence-exposure, the vocab fix — high
  value/effort, and the pre-pass *underpins* Tier 3, so it's leverage not just a feature.
- **Tuning (Tier 2):** recall + richness — the soft axis the benchmarks exposed, now justified to address.
- **Cross-persona expansions (Tier 3):** the convergent capabilities, built on the foundation.
- **R&D (Tier 4):** runs parallel, research-gated; doesn't block the above.
- **Fixes (Tier 5):** opportunistic.

## Standing disciplines (carry into all of it)
- **Measure before build** — the order experiment may dissolve its own question; the local arm decides
  whether the thesis holds on its target hardware.
- **Evaluate on a real corpus** before n-ary and OpenIE-seeding (both are seductive-on-paper).
- **Signal-not-verdict** for OpenIE candidates and forensic signals; **redact-not-extract** for secrets.
- **Most scrutiny to the most flattering result** — the reflex that retracted three results this arc.

## Hand-back
If injection hasn't been spiked end-to-end, that's #1 — it's the cheapest way to learn whether the whole
thing delivers, and it should anchor everything below it. Then exact dedup (free win), then the
order-experiment-gated pre-pass (foundational), then the tuning chapter. The R&D streams (video) run in
parallel on their own research clocks. The through-line: you've validated that wanshi *extracts* well;
the post-release job is to validate that the extraction *serves its purpose*, then make it richer where
the benchmarks showed it's thin.

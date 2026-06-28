# Brief — benchmark & validation corpus (the standing eval gate)

**From:** Dove 🕊️ · **To:** Cheetah 🐆 · **Date:** 2026-06-19
**Type:** planning + architecture (the highest-leverage pre-release item). Subsumes Phase-10 **c**
(benchmarking) **and** the validation sweep for the eight unvalidated readers/adapters/engines.
**Why now:** one artifact solves four problems — (1) validates the build burst, (2) replaces the
stale README numbers, (3) answers the "triple F1 0.07 / the R is broken" criticism *honestly with a
fresh measured baseline*, (4) converts "six models said they'd use it" into evidence. Build it as the
**permanent eval gate**, the way the real-corpus canon harness became the permanent canon gate — not
a one-shot.

## Read this first — the load-bearing distinction (metric-yield tiers)
Corpora do not all measure the same thing. Conflating "it ran on real data" with "it's accurate vs
baselines" is how benchmark tables lie. Three tiers, and **every corpus must be filed into exactly
one**:

- **Tier 1 — gold-labeled extraction benchmarks** → **comparable F1** (Entity/Relation/Triple), the
  four-way table. The only tier where vs-baseline accuracy is meaningful.
- **Tier 2 — self-labeling graph-native corpora** → **real-corpus accuracy, cheaply** (the trick
  below). The bridge: real data, no hand-annotation.
- **Tier 3 — unlabeled real corpora** → **validation-that-it-runs + intrinsic metrics**, *not F1*.
  Attacks the validation debt; must never be reported as an accuracy number.

## Corpus → metric map
| corpus | tier | yields | tests |
|---|---|---|---|
| **CrossRE** (full multi-domain split, **not** the n=20 sample) | 1 | Entity/Relation/Triple F1, comparable | extraction core; the README-number replacement |
| **MINE-1/2** (Stanford's own bench, open-sourced) | 1 | retention %, RAG acc — **head-to-head vs KGGen on their turf** | the direct KGGen comparison |
| **SemEval-2010 T8** | 1 | entity-capture % | entity extraction vs human gold |
| **ICIJ Offshore Leaks DB** (public CSV/Neo4j dump) | 2 | entity/relation recall on a **real investigative graph** | the self-labeling oracle + the SQLite/Class-A adapter |
| **Enron email corpus** | 3 | runs + intrinsic | `EmailReader` (+threading) — the headline validation-debt item |
| **EDGAR / CourtListener PDFs** | 3 | runs + intrinsic | marker/mistral OCR engines on real docs |
| **public hearing / YouTube transcripts** | 3 | runs + intrinsic | `TranscriptReader` + parakeet/whisper |
| **recua trilingual** (already local) | 3 (+probe) | runs + a **cross-lingual ER probe** | the cross-lingual roadmap input |

## The two sub-deliverables (one harness, two shapes)

**A — the comparative table (Tier 1, all four tools).** *The headline artifact, the heaviest build.*
wanshi vs **Stanford KGGen / OpenIE / GraphRAG** on CrossRE + MINE + SemEval, identical scoring,
both model tiers. This is the credibility piece and the honest answer to the relation-extraction hit.
Engineering reality: the three baselines are external Python tools with different output shapes →
needs **output-normalizer adapters** (each tool's triples → one common representation) and **one
shared scorer** applied to all four. Holes are expected and must be labeled (OpenIE can't link
relations to source chunks → excluded from the MINE-2 RAG cell, exactly as the KGGen paper did).
*Fork:* re-run the baselines yourself for identical conditions (fairer, heavier) vs cite their
published MINE numbers with a caveat (KGGen 66% / GraphRAG 48% / OpenIE 30% MINE-1). Recommend
re-running at least KGGen + GraphRAG; identical conditions are the whole point of a comparison.

**B — the validation sweep (Tier 3, wanshi-only).** *Most urgent — attacks the eight unvalidated
components; needs no external tools.* Run each shipped reader/adapter/engine on its real corpus and
report: **runs-clean** (no crash, no mojibake, non-empty sane graph), **intrinsic quality** (the
Factual/Semantic/Consistency evaluators + grounding pass-rate + type-vocab health + dedup ratio — all
label-free), and the **deployment-tier structured-output check** (below). No F1 here — be explicit
it's validation + intrinsic.

**Bridge — the self-labeling oracle (Tier 2).** The trick that gets **real-corpus accuracy without
hand-annotation**: a graph-native source *is its own answer key*. Take the ICIJ Offshore Leaks DB
(or any known SQLite schema), lift it deterministically via the Class-A adapter → the **gold graph**;
render the same records to **realistic text**; run the LLM-extraction path on that text; grade
recovered entities/relations against the gold. This validates the SQLite adapter *and* uses it as the
answer key — and yields a real-investigative-corpus accuracy number the synthetic academic benchmarks
can't. **Caveat to flag:** the *rendering* sets the ceiling — render "X is officer of Y" and recovery
is trivial; render realistic prose and it's honest. The rendering fidelity is the experimental
variable; document it, and prefer realistic prose (or actual leaked-doc text graded against the DB).

## Forcing functions (the methodology, banked from the canon episode)
1. **Pre-register the metric.** Decide the matching/scoring (strict triple match **and** semantic
   threshold — report both where they diverge) **before** running wanshi, and apply it **identically**
   to all four tools. wanshi does not get semantic scoring while baselines get strict. This is the
   anti-gaming gate and the honest answer to "0.07" — *measured* low beats *asserted* low, and gives a
   baseline to improve against.
2. **Deployment-tier is mandatory.** Every number reported at **gemma3:4b** (the README default /
   deployment target) **and** a capable model. And report the **4b structured-output failure rate** —
   4b couldn't emit the adjudicator's `json_schema` (it bare-`True`/`False`'d); this benchmark is
   where we find out if it also degrades the **extraction** schema. That answers the queued question as
   a side effect.
3. **Real and sized; report variance.** No sub-100-sample headline metric (the embedding-bench's
   ±0.05–0.08 noise + the README's own n=20 are the cautionary tale). Multiple runs / error bars on
   the LLM-nondeterministic numbers. *Curated micro-sets lie* — the lesson the canon precision
   collapse taught at cost; the corpus must be sized enough to be believed.
4. **Standing, not one-shot.** One command re-runs the whole thing; corpora fetched by script (public)
   or local (recua); checked in; versioned. It becomes the regression gate for "did this change
   improve or regress extraction quality."
5. **Honest about holes.** Not every cell has a number. Label the gaps; never fabricate an F1 for a
   Tier-3 corpus.

## Phasing
- **Phase 0 — pre-register + acquire.** Fix the scoring methodology (the anti-gaming gate) + harness
  skeleton + corpus fetch scripts (Enron, EDGAR/CourtListener, ICIJ dump; CrossRE-full; MINE). Seam
  recon: does the eval harness (`src/evaluation/`, `classifier-eval`/the CrossRE harness) generalize to
  a multi-corpus, multi-tool driver, or need restructuring? Cite file:line.
- **Phase 1 — validation sweep (Tier 3, wanshi-only).** Urgent, cheapest, no external deps. Run the
  eight components on their corpora; report runs-clean + intrinsic + the 4b structured-output check.
  Run with **`trace.enabled`** so the intrinsic analysis runs off trace events (the trace's second real
  consumer) and use the **`getLastUsage` seam** to report benchmark cost.
- **Phase 2 — self-labeling oracle (Tier 2).** ICIJ DB → Class-A adapter gold → realistic rendering →
  LLM-extract → recall. The real-corpus accuracy number.
- **Phase 3 — comparative table (Tier 1, all four tools).** Heaviest: stand up KGGen/OpenIE/GraphRAG,
  output-normalizer adapters, the shared scorer, both model tiers. The credibility artifact.

## Composes with
- **Trace layer** — Phase 1's intrinsic analysis is its second real consumer (after canon).
- **Cost-metering seam** — the harness reports its own spend via `getLastUsage` (doesn't build the meter).
- **Class-A SQLite adapter** — validated *and* used as the oracle answer key (two birds).
- **The queued 4b structured-output question** — answered as a Phase-1 side effect.
- **Cross-lingual ER (the strong follow-on)** — the recua probe in Phase 1 tells you *where* multilingual
  breaks, so that design is measured-not-guessed.
- **Phase-10 c** — this **is** that item, expanded into the standing gate.

## Out of scope
- *Fixing* relation extraction or building cross-lingual ER — this brief **measures** both honestly;
  the fixes are downstream and now have a baseline to move.
- The cost meter proper (consumes the seam, doesn't build it).
- New corpora beyond the map (the eight components + the four-way table are the scope).

## Hand-back
Phase 0's pre-registered scoring + harness seam decide feasibility. Then Phase 1 ships value
immediately (validation debt, the urgent part) while Phase 3 builds toward the headline four-way
table. The deliverable is a *reproducible* comparative table + a validated component set + a real
baseline for every quality claim — the artifact that turns opinion (theirs and ours) into evidence.

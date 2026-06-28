# Brief — benchmark hypotheses verdict + next runs (incl. Re-DocRED)

**From:** Dove 🕊️ · **To:** Cheetah 🐆 · **Date:** 2026-06-22
**Re:** verdicts on H1–H5, the next gold-benchmark batch, and folding in Re-DocRED.
**Status:** README honesty pass stays parked until the gold picture + H4 land (Cheetah owns the edit).

## The frame (carry into every cell)
- **Two benchmarks, opposite biases, read together → wanshi sits at a different precision/recall
  operating point, by design. CONFIRMED.** But the honest ceiling is **"competitive across the
  frontier," not "superior"** — CrossRE is parity (0.786 < 0.824), losing 4/6 domains. *Watch the verb.*
- **MINE is the distrusted axis.** Its judge is doing **fact verification** ("does this graph support
  this fact?") — the exact task LLM judges are known to fold on (the carwash finding: a judge reclassified
  confident-wrong answers as correct; standing constraint = *judges classify, never verify facts*). So the
  **gold-labeled benchmarks (CrossRE / SemEval / Re-DocRED) carry the load-bearing claims**; MINE is
  reported *with* the caveat that judge-mediated verification is a known-soft measurement.
- **Magnitude is metric-dependent.** The recall gap is real (gold-confirmed: 6.32 vs 5.34 ent/sentence)
  but it's **36 pts on MINE vs ~12 pts on gold recall** (0.916 vs 0.799). The README states both and
  *explains* which to weight — the "explain, don't just present" principle, and the honest way to handle
  the scariest number without burying it or apologizing for it.

## Hypothesis verdicts (what Cheetah asked for)

- **H1 — precision instrument by construction. → AGREE, scope the claim.** Two benchmarks confirm the
  *direction* (high confidence). But the claim is **"competitive/parity, precision-leaning," not "wins."**
  **SemEval either locks it (a second gold agreeing turns observation → thesis) or complicates it.**

- **H2 — the recall gap is coverage, not quality. → AGREE for entities; PENDING for relations.**
  Well-supported at the node level: wanshi's higher precision (0.773 vs 0.749) + lower ent/sentence means
  it's leaving recall on the table, not emitting wrong *entities*. **But** relation-F1≈0 is a measurement
  gap, so we **cannot yet claim wanshi's relation *quality* is high — only its entity quality.** H4
  resolves the relation half.

- **H3 — open for recall-shaped use; canon for consumption → per-use-case presets. → AGREE; this is the
  productization insight.** Open wins every MINE cell; canon serves clean/queryable/mergeable graphs.
  **CrossRE-open (run #2) upgrades this from medium-high to high** by confirming the trade is *tunable on
  the gold side too.** Presets: ingestion-for-recall → open; consumption-for-query → closed/canonical.

- **H4 — predicate-F1 floor is measurement, not capability; constrained-vocab tests it; potential
  structural edge over KGGen. → AGREE it's the most interesting + untested.** **Re-DocRED is the better
  venue than CrossRE** (real Wikidata closed schema vs 17 abstract types — see below). **Pre-register the
  honest framing before the number** (locked below). **Honest risk: document-level relation linking is
  hard for per-chunk extraction — H4 could partly fail on Re-DocRED even if it succeeds on sentence-level
  CrossRE. Don't pre-register optimism.**

- **H5 — small models are the real `related_to` problem, not the prompt. → AGREE (high), and it's a
  deployment finding, not just a benchmark one.** 88% on gemma3:4b vs 2–20% on capable models, same v4.5
  prompt. **The implication: the offline-first default tier — where the thesis lives — is exactly where
  vocab hygiene is worst.** This re-raises the **nearest-in-vocab embedding-mapping fix** (provider-
  independent, replaces the `.catch("related_to")` collapse) as the right deployment-tier repair, and the
  **MINE local arm** as the run that quantifies how bad the offline floor actually is.

## Next runs (ranked)

### Locked batch — gold first, judge-free, load-bearing
1. **SemEval entity-capture** (loader built, never run live). Second gold benchmark → locks H1 isn't
   CrossRE-specific. *Cheap, judge-free. Do first.*
2. **CrossRE open-predicate cell.** Adds the open arm to the CrossRE side → closes the 2×2, upgrades H3.
   *Cheap (cache the KGGen side, re-extract only wanshi), judge-free.* Predict: open ↑recall, ↓precision,
   node-F1 ~flat — mirroring MINE.
3. **Re-DocRED [NEW] — the document-level gold benchmark.** Fills the matrix's document-level gap and is
   the best H4 venue (rationale below). *Meatier harness work — sequence after the two cheap confirmations.*
4. **★ Constrained-vocab H4 — on BOTH CrossRE (mechanism check, 17 types) AND Re-DocRED (the real test,
   96 Wikidata Pids).** The headline experiment. Framing pre-registered below.

### Deprioritized — README waits, and gold carries the claims
- **Same-model KGGen MINE cell** — would make the MINE number fair, but MINE is the distrusted axis and
  the README isn't being written yet → low urgency.
- **Judge-sensitivity sweep** — the *direction* is already gold-corroborated and the *magnitude* is
  known-soft; the carwash finding already justifies the MINE caveat. A sweep would only re-confirm a known
  weakness. **Skip / optional — spend the budget on gold instead.**
- **Density ablation** — informs the H3 preset design; runs *after* the gold picture, not before.
- **MINE local arm** — quantifies the offline floor (H5 / deployment quality); owed, but speaks to
  deployment, not comparative credibility.

## Re-DocRED — why it earns a slot
- **Document-level (vs sentence-level CrossRE/SemEval).** Tests cross-sentence / multi-hop relation
  extraction — *closer to wanshi's actual use case* (whole documents, not isolated sentences). The current
  matrix has no document-level gold cell; this is it.
- **Closed canonical vocabulary (96 Wikidata Pids).** A **real, concrete closed schema** — exactly what
  the glossary / `relationTypeVocabulary` path is built to consume, and a far more realistic H4 target
  than CrossRE's 17 abstract types. *(Caveat: 96-way closed vocab also stress-tests the glossary path
  itself — prompt length + the model's ability to pick among 96. Not guaranteed even if the mechanism is
  sound.)*
- **Fair precision.** Re-DocRED **fixes the original DocRED false-negative problem** (DocRED's incomplete
  gold penalizes correct-but-unannotated triples as false positives → sandbags a precision-focused tool).
  Original DocRED would have *unfairly tanked* wanshi's precision; Re-DocRED is the corrected version.
  **Same data-integrity theme as the corrupted MINE mirror — verify the gold is complete before trusting
  a precision number.**
- **Honest risk (state it up front).** Document-level cross-sentence linking is hard for per-chunk
  extraction; wanshi may score low on Re-DocRED relation-F1 even if entity-F1 holds. **This could be an
  honest hard result — treat it as a real capability probe, not an assumed win.**
- **Harness cost.** Real, not cache-reuse: entity-mention-cluster alignment + the Re-DocRED **triple-F1
  and Ign-F1** scorer (Ign-F1 excludes train-seen triples → measures generalization vs memorization).
  Reuse the existing matchers where possible; budget the alignment work.
- **Future hook (don't scope-creep now):** Re-DocRED entities carry Wikidata types → a later
  entity-resolution-to-Wikidata probe (the cross-persona external-KB-linking theme). Note it, don't build
  it this run.

## The pre-registered H4 framing (lock before the number lands)
**Honest claim:** *"When the target relation schema is known, wanshi hits typed-relation F1 natively via
closed vocab; KGGen has no such mode."* **NOT** *"wanshi beats KGGen at relation extraction"* — that would
compare wanshi-with-the-schema against KGGen-without-it. Write this sentence **before** seeing the result.
Re-DocRED's real Wikidata vocab makes this the most credible version of the test; the win, if it comes, is
"schema-aware typed extraction," scoped exactly that narrowly.

## Hand-back
Run the gold batch (SemEval → CrossRE-open → Re-DocRED), then H4 on CrossRE + Re-DocRED with the framing
locked. MINE-side fairness runs deprioritized — gold carries the claims, MINE is the soft axis the carwash
finding tells us to distrust. README waits for the gold picture + H4. Verdicts: **H1/H5 confirmed-and-
scoped, H2 confirmed for entities (relations pending H4), H3 upgrades with CrossRE-open, H4 is the open
experiment** — and Re-DocRED is where it gets its realest test.

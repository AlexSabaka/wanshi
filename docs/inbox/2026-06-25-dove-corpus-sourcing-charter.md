# Brief — domain corpus sourcing (parallel project charter + gold-RE catalog)

**From:** Dove 🕊️ · **To:** Cheetah 🐆 (execute) + Sabaka (scope/decide) · **Date:** 2026-06-25
**Re:** stand up a **separate lane** for sourcing domain gold RE corpora — to baseline pipeline quality
on *real labeled data* before any domain features, close the single-document-dataset caveat on the
precision arc, and give the "metrics diff" a defined oracle. Includes the full per-domain catalog.
**Governing principle:** *gold = real F1; no gold = intrinsic/qualitative only — define the metric per
domain BEFORE sourcing.*

## Why this is its own lane
- **Verification lane** (the other brief) = validate the 60 audit fixes + re-confirm the WS-01-touched
  benchmark numbers + the local sweep.
- **This lane** = source / prep / validate domain corpora for baseline quality measurement.
- They **share** disciplines (loader validation — the WS-01 bug class; guilty-until-proven) and the
  **rented GPU** (coordinate the schedule), but run in **separate worktrees/sessions**.
- **Bridge asset:** the **code corpus** (developer oracle) serves *both* lanes — it's the best correctness
  oracle (a codebase's AST/imports/call-graph *is* ground truth) **and** it exercises the 3 riskiest audit
  fixes (KG-04 stubs, KG-13 config identity, WS-24 AST provenance). Source it here; its run feeds the
  verification lane.

## The oracle principle (the gate)
"Quality diff" is undefined without a metric, and **most corpora have no ground truth**:
- **Gold-labeled corpus** → automatable correctness F1 (the real number). Steal it.
- **No gold** → intrinsic (well-formedness) + provenance-completeness + spot-check only. Intrinsic
  **cannot detect** a feature that improves *correctness* without changing *structure* (e.g. p53 ≡ TP53
  resolution may not move a connectivity score).
- **GATE: for each target domain, define the oracle + metric BEFORE sourcing.** Don't source a corpus you
  can't score — a demo ("it ran, looks plausible") is not a baseline ("the number moved when I added X").

## The catalog — gold RE corpora by domain
*(level = sentence vs document; license flag where it's not freely downloadable)*

### General / encyclopedic (baselines, domain-agnostic) — oracle: STRONG
- **TACRED / Re-TACRED** — news/web, 41 relations, sentence; the largest general RE (LDC distribution).
- **Re-DocRED** — Wikipedia, 96 Wikidata relations, **document**. *[already used]*
- **SemEval-2010 T8** — general, 9+1 relations, sentence. *[already used]*
- **CrossRE** — 6 domains, 17 relations, sentence. *[already used]*
- **DWIE** — Deutsche Welle news, 65 relations, **document**, + coreference.
- **FewRel** — Wikipedia, 100 relations, few-shot.

### Biomedical / clinical (the richest, most variety) — oracle: STRONGEST
- **BioRED** — **document**; gene/disease/chemical/variant, 8 relation classes; ~600+600 articles. ← the
  top document-level add; your comp-bio persona's home.
- **BC5CDR** — 1,500 PubMed abstracts, chemical-disease, ~3,116 relations. The canonical one.
- **ChemProt** (chemical-protein, 5 classes) / **DrugProt** (extension, 13 classes).
- **DDI-2013** — drug-drug interaction, 4 classes, ~5,000 DDIs (SemEval-2013 T9).
- **n2c2 / i2b2** — clinical notes (2010 relations, 2012 temporal, 2018 ADE/medication). **DUA/registration
  required.**
- **THYME** — clinical temporal. **Membership fee.** · **E3C** — clinical, multilingual, free.
- **AIMed / HPRD50 / BioInfer** — protein-protein, older.
- *RETIRE GAD* — gene-disease, but documented label-quality issues (authors acknowledge); don't use.

### Chemistry (reactions — and your n-ary exemplar) — oracle: STRONG (reactions)
- **ChEMU 2020/2021** — chemical reactions from patents, 1,500 snippets, **event extraction**: compounds +
  roles + conditions + reaction steps. ← reaction-cycle structure as gold; the n-ary/reified-event target.
- *(chemical-protein / chemical-disease live in the biomedical chem-* sets above.)*

### Scientific / academic / CS (dev + PhD overlap) — oracle: STRONG
- **SciERC** — AI/CS abstracts, 6 entity + 7 relation types, + coref. The classic.
- **SciER** (2024) — datasets/methods/tasks, 1,000 papers, ~10K entities / ~7K relations.
- **SciREX** — **document**, ML papers, **n-ary tuples** (method/dataset/metric/task). ← document + n-ary.
- **SemEval-2018 T7** — scientific RE over the ACL Anthology.

### Finance / business (+ your OSINT proxy) — oracle: STRONG
- **REFinD** — SEC 10-X filings, ~29K instances, 22 relations, 8 entity pairs (person-title, person-org,
  org-org, org-money). ← these *are* investigative who-controls-what relations; the OSINT-shaped gold.
- **FinRED** — earnings/news, ~6.7K instances, 29 relations (smaller).
- **DFKI business-products** — company-product / supply-chain relations.

### History / cultural heritage (HAS gold — corrected from my earlier guess) — oracle: STRONGER than expected
- **CHisIEC** — ancient Chinese, 13 dynasties / 1,830 years, 4 entity + 12 relation types, ~8,609
  relations; **document**, temporal (GitHub, open).
- **HistRED** — Korean/Hanja historical records, bilingual, sentence→**document**, evidence-sentence
  annotated.
- **KoCHET** — Korean cultural heritage (NER/RE/ET). · **HIPE** — historical newspapers FR/DE/EN
  (NER + entity-linking; not full RE).
- *Document-level + temporal (CHisIEC/HistRED) maps onto the historian "account shifts over time" use case.
  Caveat: heavily Asian-history-skewed; no broad Western-history RE gold exists.*

### Math — oracle: WEAK/ABSENT (a real gap)
- No canonical typed-RE gold corpus. Closest: **DEFT** (definition extraction — term-definition relations,
  includes science/math) or formula/theorem-structure work (sparse research datasets).
- → intrinsic/qualitative, or DEFT-adjacent at best. To get a real math RE number, you'd annotate one.

### Veterinary — oracle: ABSENT (canonical) (a gap)
- No canonical gold RE benchmark. Raw data: **VetCompass / SAVSNET** (UK veterinary EHR) — unlabeled.
  Biomedical/clinical corpora partially transfer (animal-model studies; species-interaction sets).
- → demo, biomedical transfer, or build-your-own.

### Legal (litigation-adjacent, emerging) — oracle: PARTIAL
- **CUAD** (contract clauses — span extraction more than typed-RE) · **ContractNLI** (NLI).
- → clause-level, not relation-graph; partial oracle only.

### Events / n-ary (cross-domain — for the reified-relations feature) — oracle: the n-ary gold
- **MAVEN-ERE** — event coref / temporal / causal / subevent (large).
- **ChEMU** (chemical reaction events) · **SciREX** (n-ary tuples) · **ACE/ERE**.

## Prioritization (what to source first)
- **Tier 1 — document-level, open, cross-domain** (close the single-dataset caveat + test precision-arc
  *domain-generality*): **BioRED**, **SciREX/SciER**, **DWIE**, **CHisIEC/HistRED**. Each is another
  document-level data point that confirms-or-breaks the precision arc.
- **Tier 2 — schema-closed for H4 + domain depth:** ChemProt/DrugProt/DDI, REFinD, SemEval-2018 T7 (feed
  the closed vocab, measure typed-F1 — the H4 mode).
- **Tier 3 — n-ary (when that feature lands):** ChEMU, MAVEN-ERE, SciREX.
- **Bridge — the code corpus:** source early; best oracle, free, and it exercises the 3 riskiest fixes.
- **Skip as a *baseline* (demo only):** math (DEFT at most), veterinary (transfer/build), legal (partial).

## Phases
- **Phase 0 — define oracle + metric per target domain** (the gate; no sourcing without it).
- **Phase 1 — source + license-check.** Open ones first; flag the DUA/fee ones (n2c2/i2b2/THYME) — don't
  architect around a corpus you can't actually obtain.
- **Phase 2 — build + VALIDATE loaders. The WS-01 lesson is law here:** every new loader gets a "load dir,
  assert domain/sample spread + count" test and is checked for the **cumulative-vs-per-file `--limit` bug
  class** before any number is trusted. Reuse the existing `gold-compare` harness (`--dataset` + alignment
  + scorer) where possible.
- **Phase 3 — baseline runs** (wanshi + KGGen, on the rented GPU; **coordinate the GPU** with the
  verification lane).
- **Phase 4 — reconcile:** does the precision arc hold across domains? Which confirm / which break it? This
  feeds the README's domain-generality claim — and clean negatives triangulate.

## Out of scope (this lane)
- **Domain features / integrations** — this is baseline-*sourcing*; features come *after*, measured against
  these baselines.
- **The no-oracle personas as quantitative baselines** — demo only.
- **The fix-validation + premium re-runs** — the other lane.

## Coordination with the verification lane
- **Shared:** loader-validation discipline (WS-01 class), guilty-until-proven, the rented GPU (schedule).
- **Shared asset:** the code corpus (serves both — quality oracle + exercises the risky fixes).
- **Separate:** worktrees/sessions; this lane never touches the `audit-fixes` branch.

## Sabaka's action items
1. Create the parallel project / worktree for this lane.
2. Pick the Tier-1 sourcing order — I'd start **BioRED + a code corpus** (best document-level bio oracle +
   the bridge asset).
3. **Define the oracle + metric** for each chosen domain (Phase 0) *before* sourcing it.
4. Decide which lane owns the **code corpus** (it bridges both).
5. Confirm licensing for any DUA/fee corpora you actually want (n2c2/i2b2/THYME) — or skip them.

## Hand-back
Define the oracle per domain → source the open **document-level** ones first (BioRED, SciREX, DWIE,
CHisIEC/HistRED) + a code corpus → **build-and-validate each loader** (WS-01 discipline) → baseline
wanshi-vs-KGGen on the rental → reconcile for domain-generality. The **math/veterinary** gaps stay demos;
everything else gets a real number. This lane produces the baselines the eventual domain features get
measured against — so the feature work finally has a metric that can *detect its own effect*.

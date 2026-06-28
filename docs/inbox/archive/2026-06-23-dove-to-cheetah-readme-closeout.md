# Brief — README honesty closeout (the benchmark chapter)

**From:** Dove 🕊️ · **To:** Cheetah 🐆 · **Date:** 2026-06-23
**Re:** closing the benchmark/README chapter — the premium cells validated both claims (and
*strengthened* them), the final scoped framing, the disciplines banked, and answers to your two
operational questions.
**Status:** gold + premium complete → README honesty pass is GO; Cheetah owns the edit.

## The verdict — validation worked, and the verb upgrade is now earned
The document-level "wins" verb was parked pending frontier confirmation (n=100 on one mid-tier model
wasn't model-general). It's now confirmed across **three** models and it **strengthens monotonically
with capability**:
- **Precision arc (Re-DocRED two-way):** wanshi win +3.4 (deepseek-v4-pro) → +10.1 (sonnet-4.6) →
  +17.4 (gpt-5.4). Mechanism robust: stronger models over-extract more (KGGen 21.6 → 32.1 ent/doc) →
  precision craters faster on long docs (0.53 → 0.40) → wanshi's discipline is the moat, and it
  **widens at the frontier**.
- **H4 schema-aware typed extraction:** lifts on all three, best on the strongest (4× → 6× → 10× vs
  KGGen), and **Ign-F1 ≈ triple-F1 on every model** → generalization, not memorization, all the way up.

We didn't claim it early; we waited for the confirmation; it came back stronger. That's the discipline
working, not luck.

## The one caveat that survives (state it, don't overclaim past it)
It is now **model-general** (3 models, monotonic) but rests on **one document-level dataset**
(Re-DocRED, n=100). The model axis is locked; the document-level axis is a single benchmark. So the
earned claim is *"the better tool on document-level RE, confirmed across models,"* **not** *"wanshi wins
all document-level extraction."* A second document-level benchmark (SciERC / BioRED) closes that last
gap — note it as next, don't write past it.

## The final scoped claims (what the README states)
- **(a) Precision arc — upgraded.** *"wanshi trades recall for precision; the advantage grows with
  document length AND with model capability — on document-level relation extraction it's the better tool
  on balanced F1, confirmed across deepseek-v4-pro / sonnet-4.6 / gpt-5.4, the margin widening as models
  get stronger."* Caveat inline: one document-level dataset so far.
- **(b) Schema-aware — held exactly as pre-registered.** *"When the target relation schema is known,
  wanshi extracts typed relations natively via closed vocabulary — ~4–10× a free-predicate baseline
  depending on model, generalizing per Ign-F1 — a mode KGGen structurally lacks."* NOT "wanshi beats
  KGGen at RE."
- **The honest rest:** sentence-level is **near-parity** (KGGen edges on recall); across all levels the
  tools are within ~3–4 pts on entity capture with the **sign flipping by document length**, and the
  **precision-stability mechanism** is the real differentiator; **MINE** is the distrusted recall axis,
  reported as context (judge-mediated fact-verification is known-soft).
- **The principle:** *explain, don't just present* — the over-extraction → precision-collapse mechanism
  IS the value proposition for knowledge workers (clean, trustworthy, attributable graphs). State the
  caveats **up front**: re-scored ≠ published; one document benchmark; MINE soft; local-model tier owed.

## The disciplines that got us here (banked — the through-line)
- **Most scrutiny to the result you most want to be true.** This chapter retracted *three* flattering
  results (corrupted MINE mirror, v5-density misread, the strictVocabulary base-predicate leak) — each
  caught before it shipped.
- **Pre-register the honest framing before the number** (the H4 claim held through the whole arc).
- **Verify the measurement before trusting it** (the mirror catch, the strictVocabulary catch).
- **Gold carries the load-bearing claims; MINE is the soft, judge-mediated axis** (the carwash /
  fact-verification finding).
- **Scope the verb** (competitive vs wins; document-level + schema-known, never unqualified).
- **Validate before claiming** (the document-level verb waited for premium confirmation — and earned it).

## Your two questions — answered
1. **Draft now or hold?** → **Draft now, on the `benchmark-tier1` worktree** (clear of the frontend
   session's `M README.md`, merges cleanly later — the benchmark section and the frontend changes touch
   different parts). Everything's validated, the framings held, there's no reason to wait.
2. **Push the 7 commits?** → The **validation hold is satisfied** (3-model confirmation), so the commits
   are safe to push. But it's now **entangled with the org relocation** you're about to do: if you're
   **transferring** the repo to `wanshi-kg` (history preserved), push whenever — they migrate with the
   repo; if you're **re-initializing** in the org, **hold the push until the new remote exists** so they
   land in the right place. Recommendation: **sequence the push with the relocation** — the hold's
   condition is met either way.

## What's left (the comparative chapter closes; the tuning chapter opens)
- **README honesty pass** — this closeout enables it (draft now, worktree).
- **★ Local-model arm — STILL owed, and it's the priority.** The crash killed it twice. This is the
  **deployment-target floor** (gemma3:4b-class) — the number that speaks to what offline-first users
  *actually get*, distinct from the comparative-credibility numbers just validated. It connects to **H5**
  (small models = the real `related_to` problem) and the **Ollama-structured-output / nearest-in-vocab
  embedding fix**. Everything above is the "vs KGGen on capable models" story; *this* is the "does the
  thesis hold on the hardware the thesis is about" story. Next benchmark priority.
- **Domain-specific document-level benchmarks** (SciERC / BioRED) — closes the single-document-dataset
  caveat + tests domain-generality of the precision arc.
- **The tuning work itself** — density / open-closed presets, the deployment-tier vocab repair.
- **Org relocation + npm publish** — your immediate next action (sequence the push with it).
- **Parked threads (unchanged):** video R1; the queued research briefs (citation 2c decontextualization,
  cross-lingual ER, classifier earns-its-keep); the remaining persona reviews; and the features scoped
  this session — structured pre-extraction (IOCs/identifiers, **secrets as redact-not-extract**), file
  dedup (exact one-source-many-paths → version-reconciliation via the multi-view pattern), and the
  order-processing experiment (**measure whether order matters before building**, prefer order-invariance
  via an entity pre-pass).

## Hand-back
Draft the README benchmark section now on the worktree, scoped claims + up-front caveats; sequence the
push with the org relocation. The chapter that closes here is the **comparative-credibility** one — a
year of vibe tests replaced by measured, validated, honestly-scoped numbers. The **tuning chapter**
(local-model floor first, then domain breadth and presets) opens next, and the local arm is the number
you're missing and the one the whole offline-first thesis rides on.

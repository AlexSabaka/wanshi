# Brief — audit-close housekeeping (checklist + merge order)

**From:** Dove 🕊️ · **To:** Sabaka (+ Cheetah 🐆 for the mechanical bits) · **Date:** 2026-06-28
**Re:** close the audit stream, reconcile docs, merge the branch sprawl to master, PR + release — in an
order that doesn't clobber fixes across branches or rewrite the README twice.
**The two traps this brief exists to avoid:** (1) the README is **three non-overlapping edits from three
branches**, not one pass; (2) the validated branches carry **their own copies of the same fixes**, so
merge order decides whether you resolve them once or twice.

## ⚠️ Do-first (genuinely unsafe to defer)
- [ ] **Rotate the OpenRouter key PROVIDER-SIDE.** Scrub ≠ rotate — the fix only deleted on-disk copies.
      The moment master is pushed (and *especially* at a public release), a key you can't prove never
      leaked is in a more-public place. Revoke + reissue at OpenRouter; confirm the old token is dead.
      **This blocks the push, not just the release.**

## Phase 1 — reconcile state BEFORE touching branches
- [ ] **TECHDEBT verification pass (hold it to the audit's own standard).** The audit caught "Paid down"
      *overclaiming* (KG-07/KG-11 partial-but-marked-done). So this is a verification pass, not
      bookkeeping: every "fixed" gets guilty-until-proven, and the 60 autonomous landings get their status
      confirmed **against the code, not against the fix report's say-so** (the fixer can't certify itself —
      same rule as its tests). Output: a TECHDEBT that reflects *true* state, so the PR description does too.
- [ ] **Pre-existing doc-debt (rides along):** README line 18 + CLAUDE.md still say `ts-node
      ./src/index.ts`; the CLI is `src/cli/index.ts` / `npm start` (and the npm package shipped, so it's
      now *actively wrong*). Fix in the same pass.

## Phase 2 — the honesty edits (two of the README's three edits; both yours, both ready)
*These are "make claims match reality" — same spirit as the audit, so they land with the audit close.*
- [ ] **Benchmark honesty edit** (ready): the validated numbers + scoped verbs — precision-stability
      amplified on dense domains, model-invariant across 4B→70B and 3 hardware tiers, hardware-independent
      quality, no `related_to` collapse, dense-architecture-reliable. **Carry the three open caveats:**
      (a) the document-level win has an unresolved 8B cell (redocred/qwen3:8b), (b) the precision collapse
      is **dense-domain-specific** (KGGen P is fine on general corpora), (c) quality-equivalence is
      *within sampling variation*, not bit-identity.
- [ ] **Feature honesty edit** (the audit's finding, ready): grounding / bi-temporal / SQLite are sold as
      default-on but ship **opt-in**. State them as opt-in. (This is the positioning truth, and it's why
      the version stays sub-1.0 — see Phase 5.)
- [ ] **Leave the frontend section alone** — it's the *third* README edit, it's not yours, and it's not
      done. Writing the unified README now means rewriting it when frontend lands. **Don't.**

## Phase 3 — merge order (the dependency runs in ONE direction)
*Why order matters: `benchmark-tier1` and `corpus-sourcing` contain their own copies of fixes that also
live in `audit-fixes` (WS-01 loader, strictVocabulary). Wrong order = resolve the same fix twice, or an
older copy clobbers a newer one.*
- [ ] **1. `audit-fixes` → master first.** It's the foundation (bug fixes + the 3 default-ON corrections
      everything else assumes). Merge/PR this as the primary close.
- [ ] **2. Rebase `benchmark-tier1` and `corpus-sourcing` ONTO the new master** (don't merge them in
      parallel) — so their loader/dataset/new-corpus work *replays on top of* the already-merged fixes,
      cleanly, instead of re-conflicting. Resolve any "same fix, two copies" in favor of the newer.
- [ ] **3. Frontend merges LAST, from its own branch, when it's ready** — it's the most isolated (UI
      files, minimal overlap). Its README section lands here.
- [ ] **Verify after each merge:** `tsc --noEmit` clean + full suite green *on master*, not just on the
      branch. (Branch-green ≠ master-green after a rebase.)

## Phase 4 — the high-risk fix re-confirmation (still owed from the audit-fix review)
*The autonomous fix run relocated verification onto your eyeball; these are the cells that carry the risk.*
- [ ] **WS-05 (C2PA) + WS-15 (SSRF):** confirm reviewed **both directions** — not just tampered→rejected,
      but *legitimate* content/redirect not *wrongly* rejected.
- [ ] **KG-04 (stubs), KG-13 (config identity), WS-24 (AST provenance):** the 3 default-ON output changes —
      a code-corpus run eyeballed (KG-04 was proven unreachable in the *benchmark* path, but confirm it's
      sane in the *production* merge path, which the benchmark doesn't exercise).
- [ ] **The bash-3.2 silent-failure confirmation** (from the local run): every M4 closed-mode number in
      the final table re-run *post-fix*, none stale. Silent bug → burden is on proving you caught all its
      effects.

## Phase 5 — PR + version + release
- [ ] **Version: 0.1.0 → 0.2.0** (NOT 1.0). This is real progress (63-finding audit, 60 fixes, the
      benchmark stream) — but the audit *just* established the default config doesn't deliver the thesis
      (grounding/canon opt-in) and the README oversold. 1.0 would claim a maturity the audit disputes.
      Save 1.0 for when the **default run *is* the thesis.** (Same honesty as metricat shipping at 0.2.0.)
- [ ] **PR description = true state** (from the Phase-1 TECHDEBT pass): what's fixed, what's opt-in, the
      three benchmark caveats, the open 8B doc-level cell. No aspirational claims.
- [ ] **npm publish** `@wanshi-kg/wanshi@0.2.0` after master is green + the key is rotated.
- [ ] **Sequence with the org relocation** (if still pending): transfer preserves history → push whenever;
      re-init → push only after the new remote exists.

## Out of scope (deliberately deferred)
- The **frontend final/unified README** — after the frontend branch lands (Phase 3.3).
- The **model sweeps** (gemma/qwen gradients, unsloth-quant, RWKV) — their own brief, after the merge.
- The **owed benchmark runs** (2nd doc-level corpus at 8B; clean wanshi-alone-on-8B deployment cell).

## Hand-back
Run top-to-bottom: **rotate key → TECHDEBT verification → the two honesty edits → audit-fixes to master →
rebase benchmark/corpus on top → high-risk re-confirm → PR + 0.2.0 + publish → frontend last.** The
ordering is the product: it's what stops you resolving the same fix twice and writing the README before
the frontend section exists. The key rotation is the one item that's unsafe to slip past the push.

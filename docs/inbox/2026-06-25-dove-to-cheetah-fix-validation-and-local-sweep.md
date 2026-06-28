# Brief — fix-validation + gold local-model sweep (rented GPU)

**From:** Dove 🕊️ · **To:** Cheetah 🐆 (execute) + Sabaka (supervise/decide) · **Date:** 2026-06-25
**Re:** validate the 60 audit fixes are *correct*, validate the data-loader family, then run the long-owed
gold **local-model** sweep (wanshi vs KGGen) on a rented GPU. Budget-disciplined: **cloud-minimal**
(re-run only what WS-01 could have corrupted), **local on flat GPU-rate**.
**The governing discipline:** the audit's own rule, turned on the *fix* report — *"a green suite is a
health signal, not proof."* The fixer authored the tests that bless its own fixes, so **the tests don't
count as the independent check; the eyeball + real runs do.** Verification has *relocated* onto review,
not disappeared.

## Phase 0 — pre-flight (before any GPU spend)
- **0a — Rotate the OpenRouter key PROVIDER-SIDE.** The fix *scrubbed* the on-disk copies; the audit said
  **rotate**. Scrub ≠ rotate — a key you can't prove never leaked (logs, backups, this overnight run that
  touched it) must be **revoked + reissued at OpenRouter**. Confirm the old token is dead at the provider.
  *(Sabaka — only you can.)*
- **0b — Static loader-family check (guilty-until-proven the whole family).** WS-01's bug class is a
  **cumulative-vs-per-file `--limit` guard**. Check the **Re-DocRED, SemEval, and MINE** loaders for the
  same pattern, not just CrossRE. **Re-DocRED matters most — the headline document-level claim rides on
  it**, and its loader is currently *unverified*, not *verified-clean*. Five-minute static read each.
- **0c — Supervised fix review — concentrate on the 5 that carry the risk** (the other 55 are
  byte-identical / cache / validation-only → skim):
  - **WS-05 (C2PA) + WS-15 (SSRF)** — review **both directions**: the tests assert tampered→invalid /
    loopback→blocked, but can't show whether a *valid* manifest or a *legitimate* redirect now gets
    wrongly **rejected**. A fail-open gate patched wrong becomes fail-closed wearing the same patch.
  - **KG-04 (materialized stubs)** — the longest stare. It now **creates graph nodes** (stub endpoints)
    that didn't exist before. "Stubs are type `other`, external-set only, no fabricated observations"
    sounds careful, but stub *pollution* is invisible to a test asserting the stubs exist → needs a
    **real prior-graph run** eyeballed.
  - **KG-13 + WS-24** — a **code-corpus run** exercises both (per-file `config` identity, AST provenance).

## Phase 1 — loader validation on real data (free, loader-only)
- Confirm WS-01 fix (already shown: whole `crossre_data/` → all 6 domains, 3460 samples).
- For any loader 0b flags: add the "load dir, assert domain/sample spread" test, fix if needed.
- **GATE: no benchmark number is trusted until the loaders are validated.** This is the prerequisite for
  trusting *anything* downstream.

## Phase 2 — cloud-minimal re-verification (OpenRouter, ~$5–10, balance-gated)
- Re-run **only the CrossRE cells WS-01 could have corrupted**, on the **same models** (deepseek-v4-pro),
  and confirm the near-parity numbers hold. This is the one place a shipped number could be silently wrong.
- Re-run Re-DocRED / SemEval cloud cells **only if 0b flagged their loaders**. Otherwise leave them — the
  document-level headline is on Re-DocRED and doesn't need re-buying unless its loader is suspect.
- Keep the balance-gate (the OpenRouter credits-API ceiling Cheetah already wired).

## Phase 3 — gold local-model sweep on the rented GPU (flat rate, the long-owed arm)
- **Deploy via the Docker stack** (see chat) — reproducible env = the `SCORING.md` discipline, and both
  RunPod/Vast run standard Docker containers, so the image *is* the deploy vehicle.
- **Lineup:** the deployment tier (gemma3:4b, qwen3:8b, …) × the gold benchmarks (MINE/CrossRE/Re-DocRED/
  SemEval) × **wanshi vs KGGen** (KGGen via its real Python package, same as the premium cells).
- **Config locked + documented** (`OLLAMA_MAX_LOADED_MODELS`, `OLLAMA_KEEP_ALIVE`) — though a 24 GB
  discrete GPU mostly dissolves the M4 OOM, pin the config so the result is "what this config produces."
- **Capture:** quality (the gold cells) **and** throughput (tokens/sec) — but tag throughput with the
  caveat that **rental speed ≠ M4 speed**.

## Phase 4 — reconcile + (conditionally) update docs
- **Does the precision arc / H4 hold at the LOCAL tier?** This is the new signal — and it connects to
  **H5** (small models are the real `related_to` problem). If the local models collapse to `related_to`,
  that's the deployment-tier vocab story, not a wanshi-vs-KGGen story.
- Update the benchmark report + README **only after** loaders validated + CrossRE re-confirmed + local arm
  in. Until then the README's CrossRE numbers stand on one known-fixed-but-not-re-run loader.
- **The M4 feasibility run stays separate (still owed):** rental = extraction **quality**; M4 = the
  **feasibility/speed/OOM floor** on the actual thesis hardware. Don't let the rental masquerade as
  answering the second.

## Verification gates / disciplines
- Loaders validated **before** any number is trusted (guilty-until-proven the whole loader family).
- The fixer's tests are **not** the check — eyeball + real runs are.
- **Cloud-minimal**: only WS-01-corruptible cells; everything else local on flat rate.
- Risk is **concentrated in 5 fixes** (2 security + 3 default-ON) — that's where review goes.
- Rotate the key **provider-side**; rental measures **quality, not M4 feasibility**.

## Out of scope (this brief)
- **Persona-corpus sourcing + the oracle/metric mapping** — later or parallel (its own plan; most personas
  have *no ground truth*, so the metric must be defined per persona before sourcing).
- **Domain-specific features/integrations** — after the baselines exist.
- **The M4 feasibility run** — separate, owed (offered as its own plan).
- **Audit residuals not yet fixed** (KG-08/17/18, WS-21/28) — lower-value follow-up.

## Sabaka's action items (parallel / decisions)
1. **Rotate the OpenRouter key at the provider** (0a) — revoke + reissue, confirm the old one is dead.
2. **Eyeball the 5 high-risk fixes** (0c) — the load-bearing review; the rest skim.
3. **Rent the GPU** (RunPod to start — see chat) and **decide the Docker image** (see chat).
4. **Decide: push `audit-fixes` / open a PR** after review — and **sequence it with the org relocation**
   (transfer preserves history → push whenever; re-init → hold push until the new remote exists).
5. **Decide the read-only FS guard** Cheetah installed (`.claude/settings.json` + the hook) — keep
   (un-exclude + commit) or delete; it's gitignored/machine-specific.
6. **Pop the parked-churn stash** (`stash@{0}`) onto the right branch when ready.
7. *(Optional, parallel)* start **persona-corpus sourcing** on the oracle-bearing subset — **code corpus
   first** (best oracle + exercises the 3 riskiest fixes + closes reader-validation debt).

## Hand-back
Pre-flight (rotate key, loader-family check, eyeball the 5) → loader validation → cloud-minimal CrossRE
re-run → local sweep on the rental → reconcile. Cloud only for what WS-01 could have corrupted; local on
flat GPU-rate. The **M4 feasibility plan** and the **persona-corpus → oracle → metric mapping** are the
next two artifacts after this lands.

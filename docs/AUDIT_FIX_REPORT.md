# AUDIT_REPORT_2 — Fix Report

**Branch:** `audit-fixes` (off `master @ 4b213b4`, local only — not pushed) · **Date:** 2026-06-24/25 (overnight, autonomous)
**Driver:** `docs/AUDIT_REPORT_2.md` (the re-audit). **Scope chosen by Sabaka:** byte-identical-safe sweep + the
default-ON bug fixes + the architectural KG-04/KG-05. **Handoff:** local commits + this report (review, then push/PR).

## Headline

- **60 findings landed** (54 WS + 6 KG) across **46 atomic commits**, each with a focused test. `git diff --shortstat
  master..audit-fixes` = **85 files, +3622 / −277**.
- **Test suite: 465 → 586 (+121 new tests)**, 89 suites, **all green**; `tsc --noEmit` clean. The full suite was run as
  a gate at every wave boundary.
- **6 deferred** (with reasons below) — the audit's own weakest/riskiest findings. **5 not addressed** this batch
  (lower-value residuals — listed below). **KG-14** (dead key) scrubbed, no commit (gitignored test data).
- **Byte-identical-default invariant held:** only 3 fixes change a *default-config* run's output (WS-24, KG-13, KG-04 —
  all on default-ON paths, each documented below + diff-checked); every other fix is on an opt-in path, cache/key-only,
  validation-only, or pass-through.
- **Confirmatory model run** (cheap, ~$0.01 of the OpenRouter budget): see "Validation" below.
- **Independent validation stream (2026-06-25):** loader family re-checked clean (RE-DocRED false-alarm cleared),
  the 5 high-risk fixes re-eyeballed both-directions and SOUND, KG-04 verified clean on a real prior-graph run (no
  stub pollution), + 3 binding tests (586 → 591, falsifiability spot-checked). Full report:
  `docs/inbox/2026-06-25-cheetah-to-dove-fix-validation-results.md`.

> ⚠️ **Please give the two security fixes a human eyeball before merge** — WS-05 (C2PA fail-open) and WS-15 (SSRF
> redirect). Both have tests asserting the corrected behavior (tampered manifest → invalid; loopback-redirect →
> blocked), but trust-gate changes deserve a second pair of eyes. *(Both re-reviewed both-directions in the validation
> stream — SOUND; two residual notes [C2PA validation_status convention; SSRF hostname-literal vs DNS] deferred to the
> corpus sweep, neither blocking.)*

## What landed, by subsystem

| Area | Findings | Commits |
|---|---|---|
| **Config** | WS-19 (null/empty→default), WS-32 (maxDepth), WS-35 (uncertainBand) | `63ecb2e` `874fc52` `d34a54f` |
| **Pipeline** | WS-14/29/56 (the dead `relationFilter` stage — top leverage) | `eacba31` |
| **Cross-run I/O** | KG-11 (jsonl prior-graph seeding path) | `a7f1079` |
| **Eval** | WS-01 (CrossRE single-domain collapse), WS-42 (MINE embed isolation) | `e959eb4` `0a251e5` |
| **Web fetch security** | WS-02 (allowlist origin/path), WS-15 (SSRF manual-redirect), WS-34 (opt-in fail-closed) | `67abd51` |
| **Grounding / citation** | WS-43/17/16 (parse/timeout/endpoints), WS-03/18 (transient+keyword cache discipline), WS-04 (per-claim faithfulness) | `cdac202` `79549b3` `8fbf7d1` |
| **Image trust** | WS-05 (C2PA fail-open), WS-44 (present-but-invalid), WS-20 (EXIF tz) | `39dd17f` `3b41bf4` `8d64c47` |
| **Cost meter** | WS-13 (cap on unpriced), WS-22 (dotted ids), WS-23 (ledger in finally), WS-60 (missing-usage) | `9c2bcf1` `61e33da` `0f4d71d` `c4e1976` |
| **SQLite adapter** | WS-08/06/07/30/57/58 (PK-tuple identity + correct FK wiring + typed cells) | `a44717c` |
| **PDF engines** | WS-10/51 (Docling fallback + debug write), WS-11 (fallback provenance), WS-53/54 (docling/mistral polish) | `84665ca` `aa27b08` `35ad328` `85a97dc` |
| **Trace / export / AST** | WS-09/31 (AST cache-the-failure + ext key), WS-12 (canon lineage), WS-36 (export faithfulness fields), WS-62/61/59 (trace vestigial/dup/sidecar-path) | `80e1773` `abdb437` `6a0e972` `3a5af5b` `64626f0` `bc112f4` `dd0066e` |
| **Default-ON corrections** | WS-24 (AST provenance stamp), KG-13 (config file-identity) | `fb98799` `2c201a2` |
| **Architectural** | KG-04 (cross-run edge linking), KG-05 (strictVocabulary prompt path) | `12081b3` `50629a2` |
| **Resume / readers** | KG-07 (checkpoint key), WS-26/50/27/47/48/49 (chat/latex/epub/email parse bugs) | `b13c6cf` `dcc5b22` `864b42c` `1024cc3` `0191d13` |
| **Classifier** | WS-39 (softmax NaN), WS-38 (cascade trace gate) | `8fc35be` `f4d5a08` |
| **Misc** | WS-55 (audio asrEngine), WS-45 (cv bbox locator), WS-46 (Observation doc) | `fa0c9f9` `8619ed0` `918c132` |
| **Docs** | README grounding/supersession opt-in honesty pass | `2bc02d4` |

## The 3 default-ON output changes (documented; not byte-identical)

These were explicitly approved as "default-ON bug fixes / architectural". Each changes output **only** when its path is
exercised (code/config corpora, or runs with prior graphs/glossary); plain prose runs are unaffected.

- **WS-24** — AST-seeded observations now carry `sourceAdapter:"ast"` + an `L<line>` locator (was: no provenance,
  unlike the EXIF/C2PA/sqlite seeds). Additive; only affects code corpora (AST is default-ON).
- **KG-13** — `config`-typed file artifacts (a model commonly types `package.json` as `config`) are now kept per-file
  distinct instead of fusing across projects. Affects code/config corpora.
- **KG-04** — relations pointing at a retrieved prior-graph/glossary entity by name now **survive** the merge (a
  lightweight stub endpoint is materialized) instead of being dropped as danglers — the v5 retrieval-linking feature
  was structurally defeated. Only fires when there are prior graphs or a glossary; a plain run has an empty external
  set → byte-identical. Reviewed: stubs are materialized *only* for external-set names (type `other`, no fabricated
  observations); ordinary danglers are still dropped.

## Deferred (6) — with reasons

| ID | Why deferred |
|---|---|
| **WS-25** | camelCase/snake dedup. The complete fix (camelCase-aware `normalizeEntityName`) changes merge matching corpus-wide — too broad to land unattended; the AST-side-only alternative is incomplete. **Wants a supervised session to eyeball real-corpus merge effects.** |
| **WS-37** | Per-chunk LLM tie-break averaging — a cost optimization (not a correctness bug) that needs an `IContentClassifier` interface/DI restructure beyond fix-scope. Opt-in cascade path only. |
| **WS-33** | MiniCheck uncertain band unreachable on single-sentence claims — a scoring-design choice, not a clear bug. |
| **WS-40 / WS-41** | Dead config (`tfAnalysis`/`schemaInduction`/`extraction.enabled`, `eval.groundTruth`). The audit notes Experiment-1 may wire these; removing risks the experiment harness. |
| **WS-52** | Marker `--use_llm` env-var passing — depends on marker's CLI contract, unverifiable without the binary. |

## Not addressed this batch (5) — lower-value residuals

Honest gap: these audit findings weren't in the wave specs (lower leverage). Quick follow-up candidates:
- **WS-21** (Med) — cross-file disambiguation rename not registered with trace lineage (trace off by default).
- **WS-28** (Med) — marker `--use_llm` passes model/key via `OPENAI_*` env vars marker may not read (sibling of WS-52).
- **KG-08** (partial) — offline `FactualMetrics` still keyword + verbatim-name; drop-mode leaves 0-observation entities.
- **KG-17** (partial) — no outline/`ollama.show` caching (perf, unprofiled on small corpora).
- **KG-18** (partial) — `watch.command.ts` still drops events during a run; `ignored:/^\./` never matches absolute paths.

Also a pre-existing **doc-debt** (not an audit finding): README line 18 + CLAUDE.md still say `ts-node ./src/index.ts`,
but the CLI is `src/cli/index.ts` / `npm start` (the merge made `src/index.ts` library-only), and the npm package has
shipped. Left untouched to avoid conflicting with the frontend PR's README refresh.

## Validation

- **Full suite:** `npx jest` → 89 suites / **586 tests green**; `npx tsc -p tsconfig.json --noEmit` clean.
- **WS-01 on real data** (free, loader-only): loading the whole `crossre_data/` dir now spans **all 6 domains**
  (ai 604 · literature 740 · music 632 · news 304 · politics 622 · science 558 = 3460 samples). Before the fix a finite
  `--limit` collapsed to `ai` only.
- **End-to-end smoke** (`npm run benchmark --dataset crossre --limit 30`, `google/gemini-2.5-flash-lite` + local
  `embeddinggemma`, ~$0.01): ran clean through extraction→merge→eval with all fixes applied — **Entity F1 0.731 exact /
  0.824 sem**, Intrinsic Quality 82.9/100, 54s. The low Relation/Triple F1 (0.09 / 0.008) is the *expected* CrossRE
  open-extraction baseline for a small model (matches the benchmark-stream finding) — no regression signal.
- WS-14 (`relationFilter` prune) and the rest are covered by the new unit tests; not re-run live.

## Setup notes (for the morning)

- The unrelated **parked churn** (`TECHDEBT.md`, `scripts/sweep-mine.sh` uncommitted edits) is preserved in
  `git stash` (`stash@{0}: parked-churn-pre-audit-2026-06-24`) — pop it onto whichever branch you want.
- A **read-only filesystem guard** was installed at `.claude/settings.json` + `.claude/hooks/guard-writable-roots.py`
  (gitignored via `.git/info/exclude`; machine-specific). It denies writes/`rm`/redirects targeting
  `/Volumes/2TB/{idump,papers,repos,…}` while allowing reads — Sabaka's requested guard for the overnight run. Remove
  it from `.git/info/exclude` + commit it if you want to keep it; otherwise delete the two files.
- **KG-14**: the dead OpenRouter key was scrubbed from the 3 gitignored `kg_tests/` files (→ `${OPENROUTER_API_KEY}` /
  `REDACTED`); `grep -rIl 'sk-or-' kg_tests/` is clean. No commit (gitignored).
- A verification subagent transiently `git checkout`'d the working tree during planning (caught + corrected); the run
  pins + re-verifies the branch before every commit.

## To verify

```bash
git -C /Volumes/2TB/wanshi-kg/wanshi log --oneline master..audit-fixes   # 46 commits, atomic, co-authored
cd /Volumes/2TB/wanshi-kg/wanshi && npx tsc -p tsconfig.json --noEmit && npx jest   # clean + 586 green
grep -rIl 'sk-or-' kg_tests/                                             # nothing (KG-14)
git branch -r | grep audit-fixes || echo 'local only (not pushed)'
git stash list                                                          # parked churn safe
```

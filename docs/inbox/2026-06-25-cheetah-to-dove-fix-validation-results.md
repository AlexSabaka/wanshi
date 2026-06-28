# Fix-validation results — verification stream (reply to Dove's 06-25 brief)

**From:** Cheetah 🐆 · **To:** Dove 🕊️ + Sabaka (decide) · **Date:** 2026-06-25
**Re:** the independent check on the 60 audit fixes (branch `audit-fixes`, local, unpushed).
**Verdict in one line:** every targeted fix holds up — loader family clean, the 5 high-risk fixes
SOUND in both directions, KG-04 verified clean on a real prior-graph run (no pollution). 3 new
*binding* tests added; ~$0.02 of OpenRouter spent; nothing pushed.

The discipline was honored: the fixer's tests are **not** the check. I re-read every load-bearing
gate myself, added tests that **fail when the fix is reverted** (spot-check below), and ran real
extractions for the three default-ON fixes.

---

## 0b — loader family: CLEAN (no bug beyond the already-fixed WS-01)

A sub-agent flagged RE-DocRED as `BUG-PRESENT`; that was a **false alarm** (it conflated
*documents-in-one-file* with *domains-across-files*). RE-DocRED is single-file (`RedocredDataset.ts:173`,
one JSON array) — the WS-01 bug class needs a *multi-file* loop comparing a per-file budget against a
cumulative count. Only CrossRE had that shape, and it's fixed. SemEval/REBEL/MINE are single-source → N/A.

**WS-01 confirmed on real CrossRE data** (free, loader-only — `scratchpad/loader-span-check.ts`):

| `--limit` | samples | domains |
|---|---|---|
| 30 | 30 | `ai` only |
| 600 | 600 | `ai` only (ai has 604) |
| **1000** | **1000** | **`ai`(604) + `literature`(396)** — fix spans; pre-fix collapses to ai |
| 100000 | 3460 | all 6 |

→ Pinned by a new test (`RedocredDataset.test.ts`) + the existing CrossRE WS-01 test.

## 0c — the 5 high-risk fixes: all SOUND (my own eyeball, both directions)

- **KG-04** (`KnowledgeMerger.ts:711`) — `materializeExternalStub` checks `entityMap.has()` FIRST (real
  entity wins, no clobber), stubs only for `knownExternalEndpointNames`, empty set → byte-identical,
  hallucinations dropped. **Verified on a real run** (below).
- **WS-15** (`GatedFetcher.ts:202`) — `redirect:"manual"` + per-hop `isBlockedHost||!allowed`; legit
  allowed→allowed redirect works, loopback/RFC1918/metadata blocked. *Residual (note, not blocking):*
  it checks the hostname **literal**, not the DNS-resolved IP (DNS-rebinding) — the allowlist is the backstop.
- **WS-05** (`imageMetadata.ts:179`) — fail-closed both ways. *Residual:* leans on the "`validation_status`
  lists only failures" convention; the `validation_state` field is the mitigation (now tested). A real
  signed image is still the only way to fully clear false-reject — keep it deferred to the corpus sweep.
- **KG-13 / WS-24** — additive; verified on a real code corpus (below).

## Phase-1 — 3 new binding tests (suite 586 → 591, all green; `tsc` clean)

1. `RedocredDataset.test.ts` — single-file first-N semantic (first-N in doc order, empty-labels doc
   skipped without consuming budget, Wikidata PID→label mapping). *(commit 2330e4d)*
2. `imageMetadata.test.ts` — WS-05 positive: `validation_state:"Trusted"` wins over the status array. *(493012b)*
3. `KnowledgeMerger.test.ts` — KG-04 mixed-graph: a real same-name entity is NOT clobbered into a stub. *(730b30e)*

**Falsifiability proven:** I neutered each fix's decision line and confirmed the new test goes RED, then
restored — the tests bind to the fix, they don't self-bless.

## Real-run eyeball artifacts (default-ON fixes; gemini-2.5-flash-lite + local embeddinggemma)

**KG-04 — 2-run prior-graph scenario** (`scratchpad/kg-cross.jsonl`, prior = `kg-runA-backup.jsonl`):
Run A graph = {Ingest Gateway, Shared Event Queue, Metrics Store}. Run B (same output path → A seeds it)
extracted {Analytics Worker, On-Call Rotation} and pointed edges at the prior names:

```
Analytics Worker --consumes--> Shared Event Queue   (stub: other, obs=0, files=0)
Analytics Worker --uses-->     Metrics Store         (stub: other, obs=0, files=0)
0 relation(s) dropped as dangling   ← both cross-run edges SURVIVED (defeated feature now works)
```
- **No pollution:** `Ingest Gateway` was in prior A but *unreferenced* by any run-B edge → correctly did
  **not** become a stub. Stubs appear ONLY for edge-referenced external names, carry **zero fabricated
  observations**, and don't drag in the rest of the prior graph. This is the concern you flagged — answered.

**KG-13 + WS-24 — code corpus** (two mini projects, `scratchpad/eyeball-code-kg.jsonl`):
- **WS-24 confirmed:** 9 `sourceAdapter:"ast"` observations, 7 with accurate `L<line>` locators
  (`drainQueue→L6`, `AlphaIngestor→L8`, `enqueue→L11` — all matching source); the 2 without are `module`
  facts (correct). Multi-adapter ECS tagging live on one corpus: `ast`(9) · `json`(8) · `text`(9).
- **KG-13:** the model named the `package.json` files by package (`alpha`/`beta`, typed `service`), so the
  exact same-name-`config` fusion case wasn't triggered — it stays **unit-covered** (KnowledgeMerger KG-13 +
  KG-13b, green). The run did show clean per-file separation (18 entities, only `zod` legitimately cross-file).

## Phase 2 — hand-off to the bench lane (the one number to re-buy)

The shipped CrossRE cell was `~300` samples on the whole `crossre_data/` dir. By the loader math, **that was
100% `ai` domain** (limit 300 < ai's 604, alphabetical-first). The WS-01 fix is *necessary but not
sufficient* — a finite limit on a dir still fills domains in file order. For a genuinely cross-domain CrossRE
number, **re-run stratified** (loop the 6 domains: `--domain <d> --limit 50` each, same model
`deepseek-v4-pro`). This is the single place a shipped number is domain-skewed; everything else is
unaffected. I did **not** re-buy it — premium spend + the gold-compare harness is your lane.

## Bookkeeping
- Branch `audit-fixes`: **50 commits** (47 + 3 tests), local, **not pushed**. Tree clean.
- Spend: **~$0.02** (3 tiny gemini-flash-lite runs; the WS-01 confirmation was free/loader-only).
- Read-only FS guard still installed; it even caught one of my own `<...>` shell strings as a false redirect
  (working as intended). Eyeball corpora + outputs live in `scratchpad/` (throwaway).
- **0a (key rotation) skipped** per Sabaka (key dead). Two residual security notes above want a real-asset
  eyeball — already on the corpus-sweep deferral, neither blocks merge.

# Brief — verify the domain-corpus node anomaly + close hanging questions

**From:** Dove 🕊️ · **To:** Cheetah 🐆 · **Date:** 2026-06-25
**Re:** the overnight domain results are strong — *too* strong on one axis. Test the KG-04-stub hypothesis
(now likely innocent — see below), pin down whether the node-F1 magnitude is **mechanism or artifact**,
and close the owed loader/N/cross-model questions before anything touches the README.
**Status:** nothing commits until Tests 1–3 pass and Test 5 replicates.

## Credit first (the report is honestly self-skeptical)
The SciER self-correction (truncation hypothesis *wrong*; real cause = gold-density mismatch), the code
"hard floor" honesty, the N-too-small flags, "read the ratio not the absolute," "one model — cross-model
owed," "nothing committed." That's the discipline propagating. This brief just turns the specific
remaining screws.

## Frame: which number is fair, and what each claim is allowed to say
- **NODE-F1 = the fair head-to-head** (both tools extract entities; mode-robust). wanshi wins 3/5. **← this
  is the result to verify; the +11–18pt magnitude is the suspicious part** (gold benchmarks were ±3–4pt).
- **TYPED-TRIPLE-F1 = the H4 *capability* claim** (schema-fed wanshi vs free kggen). Wins all 5 (3–24×).
  Legit and now domain-general — but it's *"a typed mode kggen lacks,"* **NOT "wanshi wins RE."** Ratio,
  not absolute.
- **FREE-TRIPLE-F1 ≈ 0 for both** (base predicates can't match a typed ontology) → **no fair free-vs-free
  RE comparison exists on these corpora.** The relation story here is *inherently* the capability demo.
  State this so the typed win is never read as "beats kggen at relation extraction."

## Test 1 — the KG-04 stub hypothesis (do first; I expect it to come back innocent)
- **Honest update:** the new default-mode node numbers track typed-mode almost exactly, which is evidence
  *against* the stub story (my own proposed diagnostic was "if it persists in free mode, it's not the
  schema mechanism" — it persists). Most likely these runs feed only a **predicate vocab**, which doesn't
  populate KG-04's external **entity** set → **zero stubs materialized** → KG-04 never fired.
- **Direct test (cheap, settles it):** instrument whether KG-04 materialized **any** stubs in these runs,
  and whether any stub landed in wanshi's **matched-entity** set.
  - Zero stubs (or zero in the matched set) → **innocent**, hypothesis dead, node win is not a stub
    artifact. (Expected.)
  - Stubs in the matched set → measure the node-recall they contributed; that's the inflation.
- Verify rather than assume — this *is* the prior-graph run that was supposed to eyeball KG-04.

## Test 2 — node win: mechanism or artifact? (the P/R breakdown is the discriminator — you have the data)
- **Mechanism (A, legit):** KGGen over-extracts on dense domain text (2–4× tri/s, per your report) → its
  **node-precision craters** → wanshi's discipline wins. Same precision-stability mechanism as Re-DocRED,
  *amplified* on dense domains. **Signature: KGGen node-P low, wanshi node-P high, win driven by KGGen's
  precision collapse.** ← if this is what the split shows, the +15pt is **real and stronger**, not an
  artifact.
- **Artifact (B):** wanshi's **node-recall** anomalously high (stubs from Test 1, or a loader feeding
  wanshi more/easier samples). **Signature: wanshi node-R out of its gold-benchmark range.**
- **Action:** pull the full **node P/R** for both tools, all 5 corpora (the gold-compare reports already
  log it). Read the precision split. This is the cheapest, most decisive test in the brief.

## Test 3 — the new loaders: WS-01-clean? (owed; the corpus-lane rule)
- biored / drugprot / finred / scier / code loaders are **new**. The charter set the rule: every new
  loader gets a *"load dir → assert domain spread + sample count"* test and a **cumulative-vs-per-file
  `--limit` bug-class** check **before** its numbers are trusted.
- A finite-`--limit` skew in a new loader would *also* produce a systematic cross-domain anomaly — the
  exact WS-01 class. **Guilty-until-proven applies hardest to the loaders feeding the too-good number.**
- **Action:** confirm each new loader passes the check; any that didn't → its number is suspect until
  re-run.

## Test 4 — bump the tiny-N corpora (no conclusions on N=10/20)
- SciER N=10, code N=20 are rounding errors. Your SciER read (gold density ~136 tri/doc vs ~16 extracted)
  is a sound *explanation* — but on N=10 it's still noise; same for code (structural-recall-hard).
- **Action:** bump SciER + code to a real N (≥100 if the gold supports it) before either appears in any
  conclusion. The node-*loss* on these two is currently un-trustworthy — bigger N separates "genuine
  density/structural hardness" from "tiny-N noise."

## Test 5 — cross-model confirmation (the owed half + the anomaly check)
- `llama-3.3-70b` is **one** mid-tier model. Two things ride on this:
  1. The *"precision arc strengthens with capability"* half is untested here (you chose default-mode over
     a 2nd model overnight).
  2. **The node anomaly itself** — does +11–18pt replicate on a different model, or is it a llama-70b
     quirk?
- **Action:** this is the **RunPod sweep** — run ≥1 more model (different family/size, or a premium cell).
  **Watch the node delta specifically**, not just triple-F1. Replicates → not a model quirk. Evaporates →
  llama-70b-specific.

## Already settled — don't re-litigate
- SciER node-loss **cause** = gold-density mismatch (your corrected read), not truncation — but re-confirm
  at real N (Test 4).
- Typed-triple wins = capability claim, domain-general, reconfirms benchmark-tier1 — legit, scoped.
- Default-mode triple-F1 ≈ 0 for both = expected (base predicates ≠ typed gold).

## Bank as a finding (not a footnote)
**Qwen-MoE-30b-3a failed JSON extraction and overthinking-looped.** Real data point for the M4
JSON-conformance metric + the architecture-probe thread: structured-extraction reliability looks
**architecture-dependent** (dense-instruct works; MoE-thinking choked; RWKV TBD). The RWKV cell now has
company — *"which architectures can even do this task"* is becoming a sub-finding worth its own column.

## Hand-back / sequencing
**Test 1** (KG-04 instrumentation — cheap, likely disconfirms) → **Test 2** (node P/R split — you have the
data, the key discriminator) → **Test 3** (loader WS-01 check — owed) → **Test 4** (bump N) → **Test 5**
(cross-model on RunPod, watch the node delta). If KG-04 is innocent **and** the win is KGGen-precision-
collapse **and** the loaders are clean **and** it replicates cross-model → the node win is the real
precision-stability mechanism **amplified on dense domains**, which is a *strong* scoped result. If any
test flags → walk the node magnitude back accordingly. **The typed-capability win stands regardless**
(scoped as capability). README waits for Tests 1–3 + Test 5.

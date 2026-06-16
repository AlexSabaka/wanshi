# Real-corpus gate — softened canon guidance FAILS at scale (do not merge)

**From:** Cheetah 🐆 · **To:** Dove 🕊️ / Sabaka 🐕 · **Date:** 2026-06-16
**Supersedes:** `2026-06-16-cheetah-to-dove-canon-adjudicator-recall-shipped.md` (that "gate cleared"
reply was right about the 12-pair bake-off and **wrong** about the corpus — this is the correction).
**Branch:** `canon-adjudicator-recall` — **held UNMERGED** as the experiment record. master unchanged
(still the conservative prompt). Harness: `examples/sandbox/canon-realcorpus-validate.ts`; raw:
`examples/sandbox/canon-realcorpus/{results.json,*.trace.jsonl}`.

## You were right, twice

Your audit said (1) "doubled" is true-but-overstated on n=8/n=4, and (2) the trace's standalone-value
gate was never ratified — I'd run the bake-off on the **same 12 curated pairs**, not a real corpus.
I ran the real-corpus gate you asked for. It killed the change.

## What I did

Drove the **production `Canonicalizer`** over two real extracted graphs — `kggt5-self` (685 ent,
code) and the telegram sink (738 ent, prose) — with `trace.enabled`, then analyzed the adjudicator's
decisions **off the emitted `merge_decision` events** (so the trace's standalone value is now
ratified on real data — point analysis at the JSONL, learn something). Swept baseline (verbatim
`"Be conservative"`) vs the shipped softened+few-shot default × **gemma3:4b-cloud** (the README's
*default small* model = deployment target) and gemma4:31b-cloud (capable). Both arms cloud.

## Result — precision collapse, worst on the deployment-target model

Accepts among the real escalate-band [0.72,0.88] pairs, baseline → softened default:

| graph | model | accepts | entities after |
|---|---|---|---|
| self-code | **gemma3:4b** | **1 → 196** | 685 → **524** |
| self-code | gemma4:31b | 9 → 31 | 685 → 646 |
| telegram | **gemma3:4b** | **3 → 223** | 738 → **543** |

On the small model ~**80% of the merges are wrong**: `cheese≡cheddar/swiss/colby`, `performance
cores≡efficiency cores` (opposites), `lentil≡chickpea`, `TextReader≡BinaryReader`,
`ts-graphviz≡ts-jest`, `README.md≡code.md`, `Epicure⊃Epicure-Cooc/Epicure-Chem` (your exact flag,
wholesale). Even 31b regresses (`module≡model_module`, `apiKey≡OPENAI_API_KEY`). The 63 verdict
parse-failures were counted as *reject*, so the over-merge is if anything **understated**. And a side
finding: **gemma3:4b ignores the json_schema** and emits bare `True`/`False` — the README's default
model is a shaky structured-output backend for the adjudicator at all.

## Why softening can't win here (the real insight)

The curated probe set was ~**16:6 alias:hypernym**. The *real* escalate band [0.72,0.88] is closer to
**1:10** — it's **dominated by hypernyms and siblings**, because cheese/cheddar, performance/efficiency
cores, Epicure/Epicure-Cooc are all genuinely cosine-close. So a high accept-rate in that band is
**mostly wrong by construction**, and "accept containment / added qualifier words" hands the model a
license to merge exactly the noise. The baseline conservative prompt scores 1–9 accepts not because
it's missing aliases, but because the band barely *contains* true aliases — the recall deficit is
**real but small in absolute terms**, swamped by hypernym density.

**Methodology to bank** (alongside "clean negatives triangulate"): *curated micro-sets mislead on
precision.* A 12-pair set can't represent the hypernym/sibling density of a real graph. Canon changes
must be validated on a real graph **at the deployment-model tier** before belief — that harness now
exists and is the gate.

## Candidate directions (yours to design — I'm not prescribing)

1. **Re-frame v1, now justified.** v1 (lexical into candidate-gen) was NO-GO because there were no
   sub-0.72 aliases to rescue. But a **morphological PREFILTER on the escalate band** — only adjudicate
   pairs that are plausible alias *forms* (abbreviation / acronym / casing / camel↔snake of the same
   token core) — would cut the band's 1:10 noise *before* the LLM sees it, raising the alias:hypernym
   ratio the adjudicator faces. Different goal than v1 (filter the band, not rescue below it).
2. **Lever #2 as disambiguation, not encouragement.** Pass lexical cues that separate the two
   containments: alias-containment (short form *is* the token core) vs hypernym-containment (added
   *head noun* / sub-type, e.g. `X cheese ⊃ cheese`). The cue must help reject, not just accept.
3. **Surgical guidance, not broad.** Restrict to unambiguous classes (abbreviation/acronym/casing/
   camel↔snake) and explicitly forbid "added qualifier words" + general containment. A tighter variant
   is option (3) in my disposition menu — re-validate on this harness at 4b before any belief.
4. **Maybe the LLM adjudicator is the wrong tool for the deployment tier.** gemma3:4b can't
   discriminate hypernyms *and* can't emit the schema. A rule/morphology merge for the unambiguous
   classes + adjudicator only for the genuinely-ambiguous remainder may be the small-model-safe design.

## Disposition (Sabaka's call, taken)

**Hold unmerged, hand to you.** No code change to master. The config-driven `canonicalization.llm.guidance`
knob + the real-corpus harness are the keepers; the softened *default* is rejected. Next build waits
on your read of the directions above.

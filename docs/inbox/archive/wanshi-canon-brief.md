# kg-gen — Brief: Configurable pipeline + global canonicalization

**Audience:** Cheetah (implementation)
**Status:** Experiment 1 spec. Experiment 2 (full inversion) is scoped only as seams — do not build it.
**Owner runs the A/B afterward.**

---

## 0. Goal in one sentence

Find out whether the entity-/relation-type sprawl in kg-gen is caused by **extraction order** or simply by the **absence of a global merge pass** — by bolting a global canonicalization stage onto the *existing* schema-first pipeline and measuring, before we commit to re-architecting extraction.

## 1. Hypothesis being tested (Experiment 1)

Current pipeline is schema-first: `TF analysis → LLM proposes entity names/types/relations → extract KG over corpus under that schema`. Each extraction step invents vocabulary with no global view of what other steps invented; sprawl is emergent.

**H:** A single global canonicalization pass that sees the *entire* node/edge set at once collapses most of the sprawl, without changing extraction order at all.

If true → the inversion (Experiment 2) isn't earning its keep and we skip a rewrite.
If false → schema-first extraction has already destroyed information; the inversion is justified, and we'll have the evidence for *why*.

**Do not change extraction order in this experiment.** The only new thing is the canonicalization stage and the config harness around it.

## 2. First: confirm the baseline from the repo, don't trust recalled numbers

Before building anything, run the current pipeline on the kg-gen sources corpus and record actual current values for: entity-type count, relation-type count, self-loop count, bidirectional-contradiction count, total node/edge counts. These are the baseline Experiment 1 must beat. (Prior self-analysis put these around 169 entity types / 523 relation types with ~376 self-loops and ~142 bidirectional contradictions — treat as approximate, supersede with fresh repo numbers.)

## 3. Refactor: explicit, config-driven stages

Make pipeline stages an explicit ordered list driven by YAML. The reason is forward-looking: Experiment 2 (typeless-first) must be a **reorder + flag flip**, not a second rewrite. So even though we're not running the inversion now, the stage machinery must support reordering and per-stage enable/disable today.

Stage list (Experiment 1 order):

```
tf_analysis → schema_induction → extraction → grounding → canonicalization
```

`grounding` and `canonicalization` are new stage slots. `grounding` is OFF for Experiment 1 (see §6). `canonicalization` is the focus.

## 4. YAML config (target shape — adapt names to repo conventions)

```yaml
pipeline:
  # explicit order so Experiment 2 is a reorder, not a rewrite
  stages: [tf_analysis, schema_induction, extraction, grounding, canonicalization]

  tf_analysis:
    enabled: true
    source: corpus          # 'corpus' (lexical, Exp 1) | 'graph' (structural salience, Exp 2)

  schema_induction:
    enabled: true

  extraction:
    enabled: true

  grounding:                # precision gate — OFF for Exp 1, REQUIRED before canon in Exp 2
    enabled: false
    require_cooccurrence: true   # drop edges whose endpoints don't co-occur in their source span

  canonicalization:
    enabled: true
    target: [entities, relations]   # canonicalize both node names/types and edge labels
    method: embeddings              # 'embeddings' | 'llm' | 'hybrid'

    embeddings:
      model: <PIN exact model + version>
      entity:
        cluster: agglomerative      # 'agglomerative' | 'hdbscan' | 'kmeans'
        threshold: 0.82             # cosine-sim merge threshold (used by agglomerative/hdbscan)
        k: null                     # set only if cluster: kmeans
      relation:
        cluster: agglomerative
        threshold: 0.85
        k: null

    llm:
      model: <PIN exact model + version>
      adjudicate: borderline_only   # never re-extract; only judge flagged pairs
      band: [0.72, 0.88]            # sim band considered "borderline"

    hybrid:                         # cluster with embeddings, escalate borderline band to LLM
      escalate_band: [0.72, 0.88]

eval:
  seed: 1337
  corpus: kg-gen-sources
  ground_truth: observations_87.jsonl   # the ~87 verifiable observation-layer facts
  pin_versions: true                     # pin model + embedding + tokenizer versions in run manifest

inspection:
  emit_merge_log: true
  merge_log_path: runs/<run_id>/merges.jsonl
```

Everything the owner asked for is here: enable/disable per stage, clustering algorithm choice, K, thresholds, and the embeddings-vs-LLM fork.

## 5. The canonicalization stage — behavior

Operates over the **complete** extracted graph (global view is the whole point).

**Default (`method: embeddings`):**
1. Embed entity surface forms (and separately, relation labels).
2. Cluster by cosine similarity at the configured threshold.
3. Pick a canonical representative per cluster (e.g. highest-degree / most-frequent surface form — make this configurable, default to frequency).
4. Rewrite the graph: merge cluster members to the canonical, dedup resulting parallel edges, recount.

**`method: llm`:** same clustering scaffold, but ambiguous pairs are decided by the LLM. Never re-extract — the LLM only adjudicates pairs already surfaced as candidates.

**`method: hybrid` (recommended default once both paths work):** cluster with embeddings; only pairs whose similarity falls in `escalate_band` go to the LLM for a merge/no-merge verdict. This reserves the expensive judgment for exactly the borderline cases where it pays.

**Known failure modes to guard against — these are the whole reason we instrument:**
- **Over-merge:** fusing genuinely distinct entities (e.g. `Qwen3-0.6B` and `Qwen3-1.7B` → one node). Catastrophic and invisible in aggregate metrics.
- **Under-merge:** failing to fuse obvious synonyms (`is_part_of` / `part of` / `partOf`).
- Both are threshold-sensitive and corpus-sensitive. Do **not** tune the threshold to optimize the type-count number — that directly incentivizes over-merge.

## 6. Grounding stage — build the seam, leave it OFF

Add the `grounding` stage slot and the `require_cooccurrence` logic, but keep it disabled for Experiment 1. Schema-first extraction already has implicit garbage suppression, so Exp 1 doesn't need it.

It matters for Experiment 2: typeless-first extraction is high-recall/low-precision (the OpenIE signature), so the inverted pipeline will need this grounding gate to run **before** canonicalization or it canonicalizes junk. Build the seam now so Exp 2 is a flag flip. Each edge must carry the source span it was extracted from for this to work — if extraction doesn't already retain that, add it now; it's cheap and Exp 2 depends on it.

## 7. Instrumentation — the merge-decision log is the deliverable, not the graph

The owner does not want another graph viewer. He wants to debug the canonicalization decisions, because over/under-merge are silent in aggregate. So the critical artifact is a structured **merge log** (`merges.jsonl`), one record per cluster:

```json
{
  "cluster_id": "...",
  "target": "entity",                 // or "relation"
  "surface_forms": ["Qwen3-0.6B", "qwen3 0.6b", "Qwen 0.6B"],
  "canonical_chosen": "Qwen3-0.6B",
  "member_count": 3,
  "method": "embeddings",             // or "llm" / "hybrid"
  "intra_cluster_sim": {"min": 0.84, "max": 0.97},
  "borderline_pairs": [               // pairs in the escalate/borderline band
    {"a": "...", "b": "...", "sim": 0.79, "llm_verdict": null}
  ],
  "source_spans": ["...", "..."]      // evidence, if grounding is on
}
```

This is the input to a simple merge-decision viewer (CLI table or static HTML is fine — no force-directed anything). It must let the owner scan: what got fused, what was borderline, and what the LLM decided. That's what makes the threshold tunable and catches silent corruption.

Also, while building the canon stage, compute and log **structural stats** for every node/edge label: node degree and edge-label frequency. Exp 1 doesn't use them, but Exp 2's `tf_analysis.source: graph` will (structural salience, not lexical frequency — a frequent word is not a central node). Computing them now means they're already there.

## 8. A/B arms to produce

Hold corpus, seed, and all model/embedding/tokenizer versions fixed across arms (pin in a run manifest). Multi-stage variance will eat the signal otherwise.

| Arm | canonicalization | Purpose |
|---|---|---|
| `baseline` | disabled | current pipeline, fresh numbers |
| `canon_embed` | embeddings | the cheap-and-informative test |
| `canon_hybrid` *(optional)* | hybrid | does LLM adjudication of borderline pairs beat pure embeddings? |

## 9. Metrics (score every arm against the ~87 verifiable facts)

- entity-type count, relation-type count (vs baseline)
- self-loop count, bidirectional-contradiction count
- fabricated-edge rate (edges not supported by ground truth)
- referential integrity (dangling endpoints after merge)
- **entity-resolution precision / recall** on a hand-labeled sample of merge decisions — this is the one that catches over/under-merge; the type-count number alone will lie

## 10. Out of scope for now

- Typeless-first extraction / pipeline inversion (Experiment 2). Seams only.
- TF-over-graph (`tf_analysis.source: graph`). Stat collection only, per §7.
- Any new graph-visualization UI beyond the merge-log viewer in §7.

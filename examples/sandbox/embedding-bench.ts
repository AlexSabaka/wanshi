/**
 * Embedding-model separation benchmark for canonicalization (throwaway investigation).
 *
 * Phase 4 showed embeddinggemma separates poorly (anisotropic, 0.92 knife-edge). This
 * ranks the 5 local Ollama embedding models by how well they separate TRUE co-referents
 * (curated synonym pairs) from near-miss HOMONYMS/siblings (curated hard negatives) on two
 * domains — a mixed corpus (telegram-sink) and a code corpus (wanshi self). The ranking
 * metric is scale-invariant (AUC + d′), because raw cosine thresholds aren't comparable
 * across anisotropic models. Two domains also test the "does the best model change by
 * domain" (domain→model-mapper) premise cheaply.
 *
 * Run:  npx ts-node examples/sandbox/embedding-bench.ts
 * (local Ollama only, embeddings-only, free.)
 */
import * as fs from "fs";
import { Ollama } from "ollama";
import { clusterByEmbedding, cosineSimilarity, Embedded, MergeDecision } from "../../src/shared/utils";
import { digitSignature } from "../../src/core/knowledge/merging/KnowledgeMerger";

type Pair = [string, string];
interface Corpus {
  name: string;
  graph: string;
  positives: Pair[]; // true co-referents — SHOULD merge
  hardNegatives: Pair[]; // near-miss siblings/homonyms — should NOT merge
}
interface Model {
  label: string;
  model: string;
  prefix: string; // document prefix (nomic needs one); "" = raw
}

const MODELS: Model[] = [
  { label: "embeddinggemma", model: "hf.co/unsloth/embeddinggemma-300m-GGUF:BF16", prefix: "" },
  { label: "mxbai-large", model: "mxbai-embed-large:335m", prefix: "" },
  { label: "nomic (raw)", model: "nomic-embed-text:latest", prefix: "" },
  { label: "nomic (search_document:)", model: "nomic-embed-text:latest", prefix: "search_document: " },
  { label: "snowflake-arctic", model: "snowflake-arctic-embed:latest", prefix: "" },
  { label: "granite", model: "granite-embedding:278m", prefix: "" },
];

const CORPORA: Corpus[] = [
  {
    name: "telegram-sink (mixed: ML+hardware+cuisine)",
    graph: "examples/kg-telegram-sink/data/output/graph.mcp-jsonl",
    positives: [
      ["ARMv8 architecture", "ARMv8"],
      ["ARM RISC architecture", "ARM RISC"],
      ["128-bit memory interface", "128-bit wide memory interface"],
      ["shared level 2 cache", "L2 cache"],
      ["UMAP projection", "UMAP"],
      ["300-D embedding", "300-D vector"],
      ["Mode coherence", "per-mode coherence"],
      ["FlavorGraph", "FlavorGraph nomenclature"],
      ["chemistry-vs-recipe-context spectrum", "chemistry-vs-recipe-context axis"],
      ["Mediterranean savory cooking staples", "Mediterranean savory pantry staples"],
      ["Gaussian-mixture-model (GMM) partition", "Gaussian-mixture-model"],
      ["macro-regional cuisine clusters", "cuisine macro-regions"],
      ["compound-feature (CF) sensory categories", "FlavorDB compound-feature (CF) sensory categories"],
      ["USDA macronutrient probes", "eight USDA-macronutrient probes"],
      ["chef-facing tools", "chef-facing interface"],
      ["NAND chips", "NAND storage devices"],
    ],
    hardNegatives: [
      ["Digital Signal Processors", "Image Signal Processors"],
      ["iPhone camera cluster", "iPad camera cluster"],
      ["MacBook webcam", "iMac webcam"],
      ["performance cores", "efficiency cores"],
      ["I–C edges", "I–I edges"],
      ["cheese", "cheddar cheese"],
      ["onion", "red onion"],
      ["white fleshed fish", "firm white fish"],
      ["Cuisine-clustering subset", "Food-group-clustering subset"],
      ["Epicure", "Epicure-Core"],
      ["enoki mushroom", "shiitake mushroom"],
      ["Apple", "Mac"],
      ["sweet dessert liqueurs and confections", "sweet liqueurs and cocktail ingredients"],
    ],
  },
  {
    name: "wanshi self (code/technical)",
    graph: "kg_tests/self/kggt5-knowledge-graph.mcp-jsonl",
    positives: [
      ["calculateSimilarity", "cosineSimilarity"],
      ["readConfigurationFile", "readConfig"],
      ["Whisper ASR", "asr"],
      ["Graceful shutdown", "shutdown"],
      ["@tanstack/react-query", "react-query"],
      ["getSystemPrompt", "systemPrompt"],
      ["progressNdjson", "NdjsonProgressEmitter"],
      ["mission_statement", "system_mission_statement"],
      ["graceful_cancel", "graceful_interrupts"],
    ],
    hardNegatives: [
      ["EmbeddingService", "OpenAIEmbeddingService"],
      ["IEmbeddingProvider", "IEmbeddingService"],
      ["ChunkProvenance", "ChunkResult"],
      ["merge", "deepMerge"],
      ["StructuralMetrics", "StructuralStats"],
      ["TextReader", "PdfReader"],
      ["TextReader", "MarkdownReader"],
      ["validateProcessedFile", "validateFile"],
      ["GroundingTransform", "GroundingMode"],
      ["IKnowledgeGraphMerger", "mergeGraphs"],
      ["OutlineGeneratorOptions", "OutlineOptions"],
      ["jaroWinklerSimilarity", "cosineSimilarity"],
      ["AudioReader", "ImageReader"],
      ["computeSemanticMetrics", "computeMetrics"],
    ],
  },
];

const ollama = new Ollama();

function loadNames(graph: string): string[] {
  return [
    ...new Set(
      fs
        .readFileSync(graph, "utf8")
        .trim()
        .split("\n")
        .map((l) => {
          try {
            return JSON.parse(l);
          } catch {
            return null;
          }
        })
        .filter((o) => o && o.type === "entity" && typeof o.name === "string")
        .map((o) => o.name as string)
    ),
  ];
}

async function embedAll(model: Model, texts: string[]): Promise<Map<string, number[]>> {
  const out = new Map<string, number[]>();
  for (let i = 0; i < texts.length; i++) {
    const r = await ollama.embeddings({ model: model.model, prompt: model.prefix + texts[i] });
    out.set(texts[i], r.embedding);
    if ((i + 1) % 200 === 0) process.stdout.write(`    …${i + 1}/${texts.length}\r`);
  }
  return out;
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const variance = (xs: number[]) => {
  const m = mean(xs);
  return xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length;
};
const quantile = (xs: number[], q: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))];
};

/** AUC = P(sim(pos) > sim(neg)) over all pos×neg comparisons (ties count 0.5). */
function auc(pos: number[], neg: number[]): number {
  let wins = 0;
  for (const p of pos) for (const n of neg) wins += p > n ? 1 : p === n ? 0.5 : 0;
  return wins / (pos.length * neg.length);
}

/** Standardized separation between the two groups. */
function dPrime(pos: number[], neg: number[]): number {
  return (mean(pos) - mean(neg)) / Math.sqrt((variance(pos) + variance(neg)) / 2 + 1e-9);
}

/** Threshold maximizing Youden's J (TPR − FPR) over the probe set. */
function youden(pos: number[], neg: number[]): { thr: number; j: number } {
  const cands = [...new Set([...pos, ...neg])].sort((a, b) => a - b);
  let best = { thr: cands[0] ?? 0, j: -1 };
  for (const t of cands) {
    const tpr = pos.filter((p) => p >= t).length / pos.length;
    const fpr = neg.filter((n) => n >= t).length / neg.length;
    if (tpr - fpr > best.j) best = { thr: t, j: tpr - fpr };
  }
  return best;
}

function simsFor(pairs: Pair[], emb: Map<string, number[]>): number[] {
  return pairs
    .map(([a, b]) => {
      const va = emb.get(a);
      const vb = emb.get(b);
      return va && vb ? cosineSimilarity(va, vb) : NaN;
    })
    .filter((x) => !Number.isNaN(x));
}

async function main() {
  for (const corpus of CORPORA) {
    const names = loadNames(corpus.graph);
    const probeNames = [...new Set(corpus.positives.flat().concat(corpus.hardNegatives.flat()))];
    const allTexts = [...new Set([...names, ...probeNames])];
    console.log(`\n\n################ ${corpus.name} ################`);
    console.log(`corpus entities: ${names.length}, probe pairs: +${corpus.positives.length}/-${corpus.hardNegatives.length}`);

    const rows: Array<{ label: string; auc: number; d: number; mp: number; mn: number; thr: number; collapse: number; med: number; p99: number }> = [];

    for (const model of MODELS) {
      process.stdout.write(`  embedding with ${model.label} …\n`);
      const emb = await embedAll(model, allTexts);

      const posSims = simsFor(corpus.positives, emb);
      const negSims = simsFor(corpus.hardNegatives, emb);
      const A = auc(posSims, negSims);
      const d = dPrime(posSims, negSims);
      const { thr } = youden(posSims, negSims);

      // full-corpus pairwise distribution (anisotropy) — sample to bound cost
      const items: Embedded[] = names.map((id) => ({ id, embedding: emb.get(id)! }));
      const sample: number[] = [];
      const step = Math.max(1, Math.floor(items.length / 250));
      for (let i = 0; i < items.length; i += step)
        for (let j = i + step; j < items.length; j += step)
          sample.push(cosineSimilarity(items[i].embedding, items[j].embedding));

      // complete-linkage collapse at the model's own Youden threshold
      const veto = (a: string, b: string) => digitSignature(a) !== digitSignature(b);
      const { clusters } = await clusterByEmbedding(items, {
        linkage: "complete",
        decide: (s, a, b): MergeDecision => (!veto(a, b) && s >= thr ? "merge" : "reject"),
      });

      rows.push({
        label: model.label,
        auc: A,
        d,
        mp: mean(posSims),
        mn: mean(negSims),
        thr,
        collapse: names.length - clusters.length,
        med: quantile(sample, 0.5),
        p99: quantile(sample, 0.99),
      });
    }

    rows.sort((a, b) => b.auc - a.auc || b.d - a.d);
    console.log(`\n  rank by AUC(pos vs hard-neg):`);
    console.log(`  model                         AUC    d'     pos̄    neḡ    thr*   collapse@thr*  med/p99`);
    for (const r of rows) {
      console.log(
        `  ${r.label.padEnd(28)} ${r.auc.toFixed(3)}  ${r.d.toFixed(2).padStart(5)}  ` +
          `${r.mp.toFixed(3)}  ${r.mn.toFixed(3)}  ${r.thr.toFixed(3)}  ${String(r.collapse).padStart(5)}        ${r.med.toFixed(2)}/${r.p99.toFixed(2)}`
      );
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

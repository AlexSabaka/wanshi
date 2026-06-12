/**
 * Phase 4 (4b) — embeddinggemma canon threshold calibration (throwaway).
 *
 * Loads the telegram-sink merged graph, embeds every entity NAME with
 * embeddinggemma-300m, and emits the per-model evidence the Phase-4 gate wants:
 *   1. the pairwise-cosine histogram (the distribution a single threshold sits in)
 *   2. complete-linkage clusters at entity threshold 0.88 / 0.92 / 0.95, so the
 *      over-merges (cross-domain, sibling fusion) can be eyeballed and an operating
 *      point chosen.
 *
 * Run:  npx ts-node examples/sandbox/canon-calibrate.ts
 * (local Ollama only — no LLM generation, embeddings-only, free.)
 */
import * as fs from "fs";
import { Ollama } from "ollama";
import {
  clusterByEmbedding,
  cosineSimilarity,
  Embedded,
  MergeDecision,
} from "../../src/shared/utils";
import { digitSignature } from "../../src/core/knowledge/merging/KnowledgeMerger";

const GRAPH = "examples/kg-telegram-sink/data/output/graph.mcp-jsonl";
const MODEL = "hf.co/unsloth/embeddinggemma-300m-GGUF:BF16";
const THRESHOLDS = [0.88, 0.92, 0.95];

async function main() {
  const names = [
    ...new Set(
      fs
        .readFileSync(GRAPH, "utf8")
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
  console.log(`Embedding ${names.length} entity names with ${MODEL} …`);

  const ollama = new Ollama();
  const items: Embedded[] = [];
  for (let i = 0; i < names.length; i++) {
    const r = await ollama.embeddings({ model: MODEL, prompt: names[i] });
    items.push({ id: names[i], embedding: r.embedding });
    if ((i + 1) % 100 === 0) console.log(`  …${i + 1}/${names.length}`);
  }

  // 1. pairwise cosine histogram (20 buckets)
  const buckets = new Array(20).fill(0);
  let pairs = 0;
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const s = cosineSimilarity(items[i].embedding, items[j].embedding);
      buckets[Math.min(19, Math.max(0, Math.floor(s * 20)))]++;
      pairs++;
    }
  }
  console.log(`\nPairwise cosine histogram (${pairs} pairs):`);
  const peak = Math.max(...buckets);
  for (let b = 0; b < 20; b++) {
    const lo = (b / 20).toFixed(2);
    const bar = "#".repeat(Math.round((buckets[b] / peak) * 50));
    console.log(`  ${lo}–${((b + 1) / 20).toFixed(2)}  ${bar} ${buckets[b]}`);
  }

  // 2. complete-linkage clusters at each threshold (digit veto, embeddings method)
  const veto = (a: string, b: string) => digitSignature(a) !== digitSignature(b);
  for (const t of THRESHOLDS) {
    const { clusters } = await clusterByEmbedding(items, {
      linkage: "complete",
      decide: (s, a, b): MergeDecision => (!veto(a, b) && s >= t ? "merge" : "reject"),
    });
    const multi = clusters.filter((c) => c.length > 1).sort((a, b) => b.length - a.length);
    console.log(
      `\n=== threshold ${t} (complete-linkage) === ${names.length} → ${clusters.length} entities ` +
        `(${names.length - clusters.length} collapsed), ${multi.length} multi-member cluster(s)`
    );
    for (const c of multi.slice(0, 15)) {
      console.log(`  [${c.length}] ${c.slice(0, 8).join(" | ")}${c.length > 8 ? " | …" : ""}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

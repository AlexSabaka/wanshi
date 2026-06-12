/**
 * Phase 9 — build the knowledge-injection dataset from a kg-gen graph.
 *
 * Reuses the Phase-7 export path: load an `.mcp-jsonl` graph → `toKbTriples`
 * (unique (name, property) triples) → split BY ENTITY so eval entities are unseen
 * in training, then emit mlx-lm chat-format JSONL + eval probes.
 *
 *   train.jsonl    injected facts, {messages:[user Q, assistant A]} (mlx-lm format)
 *   valid.jsonl    small slice for mlx-lm's training-loss monitoring
 *   recall.jsonl   TRAINED entities asked with a PARAPHRASED question (a hit proves
 *                  the fact was learned, not the Q→A string) — {prompt, expected, ...}
 *   refusal.jsonl  HELD-OUT entities (never trained) → the model should decline
 *
 * Run:  npx ts-node examples/kg-injection/build-dataset.ts [graph.mcp-jsonl] [outDir]
 */
import * as fs from "fs";
import * as path from "path";
import { JsonlExportStrategy } from "../../src/core/export/strategies/JsonlExportStrategy";
import { toKbTriples, KbTriple } from "../../src/core/export/strategies/kbTriples";

const GRAPH = process.argv[2] || "examples/kg-telegram-sink/data/output/graph.mcp-jsonl";
const OUT = process.argv[3] || "examples/kg-injection/data";
const HELDOUT_FRAC = 0.15; // entities reserved for the refusal test
const VALID_FRAC = 0.08; // train examples reserved for mlx-lm validation
const RECALL_SAMPLE = 150; // trained (name, property) pairs probed with a paraphrase
const SEED = 42;

// Deterministic shuffle (mulberry32) so the split is reproducible.
function shuffle<T>(arr: T[], seed: number): T[] {
  let s = seed >>> 0;
  const rng = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const ask = (property: string, name: string) => `What is the ${property} of ${name}?`;
const tell = (property: string, name: string) => `The ${property} of ${name} is`;
const paraphrase = (property: string, name: string) =>
  `Tell me the ${property} of ${name}.`;
const chat = (q: string, a: string) =>
  JSON.stringify({ messages: [{ role: "user", content: q }, { role: "assistant", content: a }] });

function main() {
  const triples = toKbTriples(JsonlExportStrategy.fromJSONL(fs.readFileSync(GRAPH, "utf8")));
  // group triples by entity name
  const byName = new Map<string, KbTriple[]>();
  for (const t of triples) {
    const list = byName.get(t.name);
    if (list) list.push(t);
    else byName.set(t.name, [t]);
  }

  const names = shuffle([...byName.keys()], SEED);
  const cut = Math.floor(names.length * (1 - HELDOUT_FRAC));
  const trainNames = names.slice(0, cut);
  const heldNames = names.slice(cut);

  // Training examples: every trained entity's triples as Q→A.
  const trainTriples: KbTriple[] = trainNames.flatMap((n) => byName.get(n)!);
  const shuffledTrain = shuffle(trainTriples, SEED + 1);
  const nValid = Math.max(1, Math.floor(shuffledTrain.length * VALID_FRAC));
  const valid = shuffledTrain.slice(0, nValid);
  const train = shuffledTrain.slice(nValid);

  const trainLines = train.map((t) => chat(ask(t.property, t.name), `The ${t.property} of ${t.name} is ${t.value}.`));
  const validLines = valid.map((t) => chat(ask(t.property, t.name), `The ${t.property} of ${t.name} is ${t.value}.`));

  // Recall probes: trained facts, paraphrased question, expected value retained.
  const recall = shuffle(trainTriples, SEED + 2)
    .slice(0, RECALL_SAMPLE)
    .map((t) => JSON.stringify({ prompt: paraphrase(t.property, t.name), expected: t.value, name: t.name, property: t.property }));

  // Refusal probes: held-out entities the model was never trained on.
  const refusal = heldNames.flatMap((n) =>
    byName.get(n)!.map((t) => JSON.stringify({ prompt: ask(t.property, t.name), name: t.name, property: t.property }))
  );

  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, "train.jsonl"), trainLines.join("\n") + "\n");
  fs.writeFileSync(path.join(OUT, "valid.jsonl"), validLines.join("\n") + "\n");
  fs.writeFileSync(path.join(OUT, "recall.jsonl"), recall.join("\n") + "\n");
  fs.writeFileSync(path.join(OUT, "refusal.jsonl"), refusal.join("\n") + "\n");

  console.log(`graph: ${GRAPH}`);
  console.log(`entities: ${names.length} (train ${trainNames.length} / held-out ${heldNames.length})`);
  console.log(`triples: ${triples.length}`);
  console.log(`train.jsonl: ${trainLines.length}   valid.jsonl: ${validLines.length}`);
  console.log(`recall.jsonl: ${recall.length}   refusal.jsonl: ${refusal.length}`);
  console.log(`→ ${OUT}`);
}

main();

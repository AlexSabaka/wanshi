import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { KnowledgeGraphBuilder } from "../knowledge/KnowledgeGraphBuilder";
import { trace } from "./TraceWriter";
import { TraceRecord } from "./events";
import { stubLogger } from "../../__tests__/helpers";

const RAW = {
  entities: [
    { name: "Qwen3", entityType: "model", observations: ["is a 0.6B model", "trained with MLX"] },
  ],
  relations: [{ from: "Qwen3", to: "MLX", relationType: ["trained_with"] }],
};

const makeBuilder = () => {
  const promptManager = { getUserPrompt: async () => "u", getSystemPrompt: async () => "s" } as any;
  const llmService = {
    generateStructured: async () => JSON.parse(JSON.stringify(RAW)), // fresh copy per call
    getModelCapabilities: async () => [],
    getLastUsage: () => ({ promptTokens: 10, completionTokens: 5, totalTokens: 15 }),
  } as any;
  return new KnowledgeGraphBuilder({ llmService, promptManager, model: "m" }, stubLogger());
};

const processedFile = () =>
  ({
    path: "f.txt",
    content: "FULL FILE TEXT",
    chunks: [
      { content: "c1", index: 1, totalChunks: 2, startOffset: 0, endOffset: 2 },
      { content: "c2", index: 2, totalChunks: 2, startOffset: 2, endOffset: 4 },
    ],
  } as any);

/** Strip the wall-clock `createdAt` (differs by time, not by tracing). */
const stripTime = (graphs: any) =>
  JSON.parse(JSON.stringify(graphs), (k, v) => (k === "createdAt" ? undefined : v));

const readJsonl = (p: string): TraceRecord[] =>
  fs.readFileSync(p, "utf-8").split("\n").filter(Boolean).map((l) => JSON.parse(l));

describe("trace — observe-only + lineage", () => {
  let tmp: string;
  let out: string;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "kgtrobs-"));
    out = path.join(tmp, "g.json.trace.jsonl");
    trace.reset();
  });
  afterEach(() => {
    trace.reset();
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("produces a byte-identical graph with trace OFF vs ON (no observer effect)", async () => {
    const off = await makeBuilder().build(processedFile(), "s");
    expect(fs.existsSync(out)).toBe(false); // off ⇒ no sidecar

    trace.configure({ enabled: true, path: out, runId: "run-x" });
    const on = await makeBuilder().build(processedFile(), "s");

    expect(stripTime(on)).toEqual(stripTime(off));
    expect(fs.existsSync(out)).toBe(true); // on ⇒ sidecar written
  });

  it("emits extraction events carrying distinct mention-instance lineage IDs", async () => {
    trace.configure({ enabled: true, path: out, runId: "run-x" });
    await makeBuilder().build(processedFile(), "s");

    const extractions = readJsonl(out).filter((r) => r.type === "extraction") as any[];
    expect(extractions).toHaveLength(2); // one per chunk

    const e0 = extractions[0];
    expect(e0.entityMentions[0].mentionId).toBe(`${e0.extractionId}|e|Qwen3`);
    expect(e0.entityMentions[0].observationIds).toHaveLength(2);
    expect(e0.relationMentions[0].mentionId).toBe(`${e0.extractionId}|r|Qwen3>MLX`);
    expect(e0.usage.totalTokens).toBe(15);

    // same name, two chunks → two distinct mention instances, both registered.
    const ids = extractions.flatMap((e) => e.entityMentions.map((m: any) => m.mentionId));
    expect(new Set(ids).size).toBe(2);
    expect(trace.lineage.mentionsFor("Qwen3")).toHaveLength(2);
  });

  it("reconstructs a node's lineage: every extraction's chunk is recoverable from the trace", async () => {
    trace.configure({ enabled: true, path: out, runId: "run-x" });
    await makeBuilder().build(processedFile(), "s");

    const recs = readJsonl(out) as any[];
    const extractions = recs.filter((r) => r.type === "extraction");
    // The chain for canonical "Qwen3": its mentions → their extractions → their chunks.
    const mentions = trace.lineage.mentionsFor("Qwen3");
    const chunkIds = mentions.map((m) => m.chunkId);
    for (const m of mentions) {
      const ext = extractions.find((e) => e.extractionId === m.extractionId);
      expect(ext).toBeDefined();
      expect(ext.chunkId).toBe(m.chunkId);
    }
    expect(new Set(chunkIds).size).toBe(2); // distinct chunks
  });
});

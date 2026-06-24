import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { DirectoryProcessor } from "./DirectoryProcessor";
import { DIContainer, TYPES } from "./di";
import { stubLogger, makeConfig } from "../__tests__/helpers";
import { meter } from "./cost";
import { shutdown } from "../shared";

describe("DirectoryProcessor — double-count regression", () => {
  let tmp: string;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "kgdp-"));
  });
  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("does not pull a prior output graph into the merge set", async () => {
    const output = path.join(tmp, "kg.json");
    // A prior run's output sits on disk with one entity.
    fs.writeFileSync(
      output,
      JSON.stringify({
        entities: [
          { name: "OLD", entityType: "t", observations: [], files: [] },
        ],
        relations: [],
      })
    );

    const container = new DIContainer();
    container.registerValue(TYPES.Logger, stubLogger());
    container.registerValue(TYPES.FileProcessor, {} as any);
    container.registerValue(TYPES.KnowledgeGraphBuilder, {
      getFailedChunks: () => [],
      getGroundingRejections: () => [],
    } as any);
    container.registerValue(TYPES.ProgressEmitter, { emit: () => undefined } as any);
    container.registerValue(TYPES.AstSeedService, {
      loadCache: async () => undefined,
      saveCache: async () => undefined,
      seedGraph: async () => null,
    } as any);

    const dp = new DirectoryProcessor(container);
    // No files this run; the prior graph must be used for retrieval only, never
    // merged. So the returned merge set is empty (would contain "OLD" before fix).
    const result = await dp.processFiles(
      [],
      makeConfig({ output, retrieval: { mode: "disabled" } })
    );

    expect(result).toEqual([]);
  });

  it("seeds prior graphs from the format-rewritten path, not the configured stem (KG-11)", async () => {
    const container = new DIContainer();
    container.registerValue(TYPES.Logger, stubLogger());
    container.registerValue(TYPES.FileProcessor, {} as any);
    container.registerValue(TYPES.KnowledgeGraphBuilder, {
      getFailedChunks: () => [],
      getGroundingRejections: () => [],
    } as any);
    container.registerValue(TYPES.ProgressEmitter, { emit: () => undefined } as any);
    container.registerValue(TYPES.AstSeedService, {
      loadCache: async () => undefined,
      saveCache: async () => undefined,
      seedGraph: async () => null,
    } as any);

    const dp = new DirectoryProcessor(container);
    const spy = jest.spyOn(dp as any, "loadPriorGraphs").mockResolvedValue([]);
    // output stem is .json but the export format is jsonl, so the writer produces
    // kg.jsonl — the prior-graph loader must look there, not at the missing kg.json.
    await dp.processFiles(
      [],
      makeConfig({
        output: path.join(tmp, "kg.json"),
        export: { format: "jsonl" },
        retrieval: { mode: "disabled" },
      })
    );
    expect(spy).toHaveBeenCalledWith(path.join(tmp, "kg.jsonl"), expect.anything());
  });
});

describe("DirectoryProcessor — cost ledger persisted on crash (WS-23)", () => {
  let tmp: string;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "kgdp-cost-"));
  });
  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
    meter.reset();
    shutdown.reset();
    jest.restoreAllMocks();
  });

  it("persists this run's spend to the ledger even when a step after extraction throws", async () => {
    const ledgerPath = path.join(tmp, "kg.cost.json");

    const container = new DIContainer();
    container.registerValue(TYPES.Logger, stubLogger());
    container.registerValue(TYPES.ProgressEmitter, { emit: () => undefined } as any);
    container.registerValue(TYPES.FileDiscoveryService, {
      discover: async () => ["/synthetic/file.md"],
    } as any);

    // Cost meter: enabled with a ledger + a real recorded spend this run.
    meter.configure({
      enabled: true,
      currency: "USD",
      prices: { "test-model": { in: 10, out: 30 } },
      ledgerPath,
    });
    meter.record("test-model", { promptTokens: 1_000_000, completionTokens: 0 }); // $10
    expect(meter.thisRunCost).toBeCloseTo(10, 6);

    const dp = new DirectoryProcessor(container);
    // Extraction "succeeds" (returns graphs) but the merge step crashes mid-run.
    jest.spyOn(dp as any, "processFiles").mockResolvedValue([]);
    jest.spyOn(dp as any, "logCostEstimate").mockResolvedValue(undefined);
    jest
      .spyOn(dp as any, "mergeGraphs")
      .mockRejectedValue(new Error("boom — merge blew up"));

    const options = makeConfig({
      output: path.join(tmp, "kg.json"),
      cost: { enabled: true, ledgerPath },
    });

    await expect(dp.processDirectory(options)).rejects.toThrow("boom");

    // The finally block must have persisted the ledger despite the crash.
    expect(fs.existsSync(ledgerPath)).toBe(true);
    const ledger = JSON.parse(fs.readFileSync(ledgerPath, "utf-8"));
    expect(ledger.total.cost).toBeCloseTo(10, 6);
    expect(ledger.runs).toBe(1);
  });
});

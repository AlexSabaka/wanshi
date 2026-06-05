import { mergeKnowledgeGraphs } from "./KnowledgeMerger";
import { JsonExportStrategy, McpExportStrategy } from "../../export/strategies";
import { KnowledgeGraph } from "../../../types";
import { stubLogger } from "../../../__tests__/helpers";

// Embeddings aren't exercised here (the two facts live in different provenance
// groups, so they're never compared), but the merger requires the dependency.
const stubEmbed = {
  embed: async () => [1, 0, 0],
  embedBatch: async (xs: string[]) => xs.map(() => [1, 0, 0]),
} as any;

const opts = {
  entitySimilarityThreshold: 0.9,
  observationSimilarityThreshold: 0.7,
};

describe("KnowledgeMerger — provenance & bi-temporal", () => {
  it("keeps per-source attribution: two sources asserting one fact → two observations", async () => {
    const g1: KnowledgeGraph = {
      entities: [
        {
          name: "Sky",
          entityType: "concept",
          files: ["A.txt"],
          observations: [
            {
              text: "the sky is blue",
              source: "A.txt",
              speaker: "alice",
              createdAt: "2026-01-01T00:00:00Z",
              validAt: "2025-12-01T00:00:00Z",
            },
          ],
        },
      ],
      relations: [],
    };
    const g2: KnowledgeGraph = {
      entities: [
        {
          name: "Sky",
          entityType: "concept",
          files: ["B.txt"],
          observations: [
            {
              text: "the sky is blue",
              source: "B.txt",
              speaker: "bob",
              createdAt: "2026-01-02T00:00:00Z",
            },
          ],
        },
      ],
      relations: [],
    };

    const merged = await mergeKnowledgeGraphs([g1, g2], opts, stubEmbed, stubLogger());

    const sky = merged.entities.find((e) => e.name === "Sky");
    expect(sky).toBeDefined();
    // one merged entity, but the identical fact from two sources is NOT flattened
    expect(sky!.observations).toHaveLength(2);
    expect(sky!.observations.map((o) => o.source).sort()).toEqual(["A.txt", "B.txt"]);
    expect(sky!.observations.map((o) => o.speaker).sort()).toEqual(["alice", "bob"]);
    // bi-temporal fields preserved through merge
    expect(sky!.observations.some((o) => o.validAt === "2025-12-01T00:00:00Z")).toBe(true);
    expect(sky!.observations.every((o) => !!o.createdAt)).toBe(true);

    // ...and survive a JSON round-trip
    const parsed = JSON.parse(new JsonExportStrategy().export(merged)) as KnowledgeGraph;
    const skyJson = parsed.entities.find((e) => e.name === "Sky")!;
    expect(skyJson.observations).toHaveLength(2);
    expect(skyJson.observations.every((o) => !!o.source && !!o.createdAt)).toBe(true);

    // MCP export downgrades to bare strings (memory-server compatible) but keeps text
    const mcp = new McpExportStrategy().export(merged);
    expect(mcp).toContain("the sky is blue");
    expect(mcp).toContain('"type":"entity"');
  });
});

import { McpExportStrategy } from "./McpExportStrategy";
import { KnowledgeGraph } from "../../../types";

const parseRelations = (jsonl: string) =>
  jsonl
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l))
    .filter((o) => o.type === "relation");

describe("MCP export", () => {
  it("emits entity + relation lines with joined relationType", () => {
    const g: KnowledgeGraph = {
      entities: [
        { name: "A", entityType: "concept", files: [], observations: [{ text: "fact a" }] },
      ],
      relations: [{ from: "A", to: "B", relationType: ["uses", "depends_on"] }],
    };
    const lines = new McpExportStrategy()
      .export(g)
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l));
    const rel = lines.find((l) => l.type === "relation");
    expect(rel).toMatchObject({ from: "A", to: "B", relationType: "uses,depends_on" });
    const ent = lines.find((l) => l.type === "entity");
    expect(ent.observations).toEqual(["fact a"]); // bare strings for memory-server compat
  });

  // WS-36: the merger preserves resolved/faithfulness/faithfulnessScore/supportingSpan
  // on a Relation; the MCP exporter must carry them as edge properties.
  it("carries reference/faithfulness provenance as edge properties (WS-36)", () => {
    const g: KnowledgeGraph = {
      entities: [
        { name: "DocA", entityType: "document", files: [], observations: [] },
        { name: "PaperB", entityType: "document", files: [], observations: [] },
      ],
      relations: [
        {
          from: "DocA",
          to: "PaperB",
          relationType: ["cites"],
          resolved: false,
          faithfulness: "uncertain",
          faithfulnessScore: 0.42,
          supportingSpan: "an ambiguous passage",
        },
      ],
    };
    const rel = parseRelations(new McpExportStrategy().export(g))[0];
    expect(rel).toMatchObject({
      from: "DocA",
      to: "PaperB",
      relationType: "cites",
      resolved: false,
      faithfulness: "uncertain",
      faithfulnessScore: 0.42,
      supportingSpan: "an ambiguous passage",
    });
  });

  it("omits provenance keys on a plain LLM edge (byte-identical default) (WS-36)", () => {
    const g: KnowledgeGraph = {
      entities: [{ name: "A", entityType: "concept", files: [], observations: [] }],
      relations: [{ from: "A", to: "B", relationType: ["uses"] }],
    };
    const rel = parseRelations(new McpExportStrategy().export(g))[0];
    for (const k of ["resolved", "faithfulness", "faithfulnessScore", "supportingSpan"]) {
      expect(rel).not.toHaveProperty(k);
    }
    // The whole serialized line is exactly the three base keys (+ type).
    expect(Object.keys(rel).sort()).toEqual(["from", "relationType", "to", "type"]);
  });
});

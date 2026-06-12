import { JsonlExportStrategy } from "./JsonlExportStrategy";
import { KnowledgeGraph } from "../../../types/KnowledgeGraph";

describe("JsonlExportStrategy.fromJSONL (KG-11)", () => {
  const strat = new JsonlExportStrategy();

  it("round-trips a graph through export → fromJSONL", () => {
    const graph: KnowledgeGraph = {
      entities: [
        {
          name: "cosine_similarity",
          entityType: "function",
          files: ["a.ts"],
          observations: [{ text: "compares two vectors", source: "a.ts" }],
        },
      ],
      relations: [{ from: "cosine_similarity", to: "shared_utils", relationType: ["part_of"] }],
    };
    const back = JsonlExportStrategy.fromJSONL(strat.export(graph));
    expect(back.entities).toHaveLength(1);
    expect(back.entities[0].name).toBe("cosine_similarity");
    expect(back.entities[0].observations[0]).toMatchObject({ text: "compares two vectors" });
    expect(back.relations).toEqual(graph.relations);
  });

  it("coerces bare-string (mcp-jsonl) observations into Observation objects", () => {
    const mcp =
      JSON.stringify({ type: "entity", name: "E", entityType: "concept", files: [], observations: ["a bare fact"] }) +
      "\n" +
      JSON.stringify({ type: "relation", from: "E", to: "F", relationType: ["related_to"] });
    const g = JsonlExportStrategy.fromJSONL(mcp);
    expect(g.entities[0].observations[0]).toEqual({ text: "a bare fact" });
    expect(g.relations[0]).toMatchObject({ from: "E", to: "F" });
  });

  it("skips blank and truncated final lines", () => {
    const content =
      JSON.stringify({ type: "entity", name: "E", entityType: "t", files: [], observations: [] }) +
      "\n\n" +
      '{"type":"relation","from":"E","to":'; // truncated
    const g = JsonlExportStrategy.fromJSONL(content);
    expect(g.entities).toHaveLength(1);
    expect(g.relations).toHaveLength(0);
  });
});

import { KblamExportStrategy } from "./KblamExportStrategy";
import { LoraExportStrategy } from "./LoraExportStrategy";
import { GraphitiExportStrategy } from "./GraphitiExportStrategy";
import { KnowledgeGraph } from "../../../types";

describe("KBLaM export", () => {
  it("emits DataPoint JSONL triples from observations and relations", () => {
    const g: KnowledgeGraph = {
      entities: [
        {
          name: "Recursion",
          entityType: "concept",
          files: [],
          observations: [{ text: "a function that calls itself" }],
        },
      ],
      relations: [{ from: "Recursion", to: "BaseCase", relationType: ["terminates_at"] }],
    };
    const lines = new KblamExportStrategy().export(g).split("\n").map((l) => JSON.parse(l));
    expect(lines).toHaveLength(2);

    const fact = lines.find((l) => l.description_type === "fact");
    expect(fact).toMatchObject({
      name: "Recursion",
      description: "a function that calls itself",
      Q: "What is the fact of Recursion?",
      A: "The fact of Recursion is a function that calls itself.",
      key_string: "the fact of Recursion",
    });

    const rel = lines.find((l) => l.description_type === "terminates_at");
    expect(rel).toMatchObject({ name: "Recursion", description: "BaseCase" });
  });
});

describe("LoRA export", () => {
  it("emits chat SFT examples and drops ungrounded observations", () => {
    const g: KnowledgeGraph = {
      entities: [
        {
          name: "X",
          entityType: "concept",
          files: [],
          observations: [
            { text: "grounded fact here", groundingScore: 0.9 },
            { text: "hallucinated fact", groundingScore: 0.2 }, // below 0.5 → dropped
            { text: "unscored fact" }, // no score → kept
          ],
        },
      ],
      relations: [],
    };
    const lines = new LoraExportStrategy()
      .export(g, { groundingMinScore: 0.5 } as any)
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l));

    expect(lines).toHaveLength(2);
    const contents = lines.map((l) => l.messages[1].content);
    expect(contents.some((c: string) => c.includes("grounded fact"))).toBe(true);
    expect(contents.some((c: string) => c.includes("unscored fact"))).toBe(true);
    expect(contents.some((c: string) => c.includes("hallucinated"))).toBe(false);
    expect(lines[0].messages[0].role).toBe("user");
  });
});

describe("Graphiti export", () => {
  it("emits add_triplet-shaped nodes + edges with stable uuids", () => {
    const g: KnowledgeGraph = {
      entities: [
        {
          name: "A",
          entityType: "concept",
          files: [],
          observations: [{ text: "obs a", createdAt: "2026-01-01T00:00:00Z" }],
        },
        { name: "B", entityType: "thing", files: [], observations: [] },
      ],
      relations: [{ from: "A", to: "B", relationType: ["relates to"] }],
    };
    const doc = JSON.parse(new GraphitiExportStrategy().export(g));
    expect(doc.nodes.map((n: any) => n.name).sort()).toEqual(["A", "B"]);
    expect(doc.edges).toHaveLength(1);
    expect(doc.edges[0].name).toBe("RELATES_TO");

    const a = doc.nodes.find((n: any) => n.name === "A");
    expect(doc.edges[0].source_node_uuid).toBe(a.uuid);
    expect(a.created_at).toBe("2026-01-01T00:00:00Z"); // earliest observation createdAt
    expect(a.labels).toEqual(["concept"]);
  });
});

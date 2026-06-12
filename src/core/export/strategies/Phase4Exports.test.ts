import { KblamExportStrategy } from "./KblamExportStrategy";
import { LoraExportStrategy } from "./LoraExportStrategy";
import { GraphitiExportStrategy } from "./GraphitiExportStrategy";
import { KnowledgeGraph } from "../../../types";

describe("KBLaM export", () => {
  it("emits DataPoint JSONL triples with a description property and capital-T key (KG-09)", () => {
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
    expect(lines.some((l) => l.description_type === "fact")).toBe(false); // no constant 'fact'

    const desc = lines.find((l) => l.description_type === "description");
    expect(desc).toMatchObject({
      name: "Recursion",
      description: "a function that calls itself",
      Q: "What is the description of Recursion?",
      A: "The description of Recursion is a function that calls itself.",
      key_string: "The description of Recursion",
    });

    const rel = lines.find((l) => l.description_type === "terminates_at");
    expect(rel).toMatchObject({ name: "Recursion", description: "BaseCase" });
  });

  it("guarantees unique (name, property) keys: aggregates many facts + same-predicate targets", () => {
    const g: KnowledgeGraph = {
      entities: [
        {
          name: "App",
          entityType: "concept",
          files: [],
          observations: [{ text: "fact one" }, { text: "fact two" }, { text: "fact three" }],
        },
      ],
      relations: [
        { from: "App", to: "react", relationType: ["depends_on"] },
        { from: "App", to: "vue", relationType: ["depends_on"] },
      ],
    };
    const lines = new KblamExportStrategy().export(g).split("\n").map((l) => JSON.parse(l));
    // one 'description' (3 facts joined) + one 'depends_on' (2 targets joined) = 2 entries
    expect(lines).toHaveLength(2);
    const keys = lines.map((l) => l.key_string);
    expect(new Set(keys).size).toBe(keys.length); // all keys unique
    expect(lines.find((l) => l.description_type === "description")!.description).toBe(
      "fact one; fact two; fact three"
    );
    expect(lines.find((l) => l.description_type === "depends_on")!.description).toBe("react, vue");
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
      .export(g, { grounding: { minScore: 0.5 } } as any)
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l));

    // The two grounded facts aggregate into one `description` example (KG-09); the
    // ungrounded one is dropped before aggregation.
    expect(lines).toHaveLength(1);
    const answer = lines[0].messages[1].content;
    expect(answer).toContain("grounded fact here");
    expect(answer).toContain("unscored fact");
    expect(answer).not.toContain("hallucinated");
    expect(lines[0].messages[0].content).toBe("What is the description of X?");
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

import { mergeKnowledgeGraphs } from "./KnowledgeMerger";
import { KnowledgeGraph } from "../../../types";
import { stubLogger } from "../../../__tests__/helpers";

const stubEmbed = {
  embed: async () => [1, 0, 0],
  embedBatch: async (xs: string[]) => xs.map(() => [1, 0, 0]),
} as any;

const opts = { entitySimilarityThreshold: 0.9, observationSimilarityThreshold: 0.7 };

/** A resolver-shaped per-file graph: path-keyed document nodes + reference edges. */
function refGraph(from: string, to: string, resolved: boolean): KnowledgeGraph {
  return {
    entities: [
      { name: from, entityType: "document", files: [`/c/${from}`], observations: [] },
      { name: to, entityType: "document", files: resolved ? [`/c/${to}`] : [], observations: [] },
    ],
    relations: [{ from, to, relationType: ["links_to"], source: from, resolved }],
  };
}

describe("KnowledgeMerger — reference edges survive merge with provenance", () => {
  it("preserves source/resolved and keeps stub-target (resolved:false) edges", async () => {
    const merged = await mergeKnowledgeGraphs(
      [refGraph("a.md", "b.md", true), refGraph("a.md", "./nope.md", false)],
      opts,
      stubEmbed,
      stubLogger()
    );

    const resolvedEdge = merged.relations.find((r) => r.to === "b.md");
    expect(resolvedEdge).toMatchObject({
      from: "a.md",
      to: "b.md",
      relationType: ["links_to"],
      source: "a.md",
      resolved: true,
    });

    // The unresolved edge must NOT be dropped by the dangling-edge gate: its
    // stub target was emitted as a (bare) document node, so the endpoint exists.
    const stubEdge = merged.relations.find((r) => r.to === "./nope.md");
    expect(stubEdge).toMatchObject({ from: "a.md", source: "a.md", resolved: false });
  });
});

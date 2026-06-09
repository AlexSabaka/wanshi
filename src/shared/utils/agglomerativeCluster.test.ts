import {
  agglomerativeClusters,
  clusterByEmbedding,
  Embedded,
  MergeDecision,
} from "./agglomerativeCluster";

/** 2D unit vector at `deg`° — cosine(vec(0), vec(θ)) = cos θ, so angles set similarity exactly. */
const vec = (deg: number): number[] => {
  const r = (deg * Math.PI) / 180;
  return [Math.cos(r), Math.sin(r)];
};

function sortClusters(cs: string[][]): string[][] {
  return cs.map((c) => [...c].sort()).sort((a, b) => (a[0] < b[0] ? -1 : 1));
}

describe("agglomerativeClusters", () => {
  it("groups near-identical vectors and separates distant ones at the threshold", () => {
    const items: Embedded[] = [
      { id: "a", embedding: vec(0) },
      { id: "b", embedding: vec(5) }, // cos 5° ≈ 0.996 → merges with a
      { id: "c", embedding: vec(90) }, // cos 0 → separate
    ];
    expect(sortClusters(agglomerativeClusters(items, 0.82))).toEqual([["a", "b"], ["c"]]);
  });

  it("does NOT merge a sub-threshold pair (over-merge guard)", () => {
    const items: Embedded[] = [
      { id: "x", embedding: vec(0) },
      { id: "y", embedding: vec(40) }, // cos 40° ≈ 0.766 < 0.82
    ];
    expect(sortClusters(agglomerativeClusters(items, 0.82))).toEqual([["x"], ["y"]]);
  });

  it("single-linkage chains transitively", () => {
    const items: Embedded[] = [
      { id: "a", embedding: vec(0) },
      { id: "b", embedding: vec(20) }, // a-b cos20≈0.94
      { id: "c", embedding: vec(40) }, // b-c cos20≈0.94 (a-c cos40≈0.77 < threshold)
    ];
    expect(sortClusters(agglomerativeClusters(items, 0.9))).toEqual([["a", "b", "c"]]);
  });
});

describe("clusterByEmbedding (escalation)", () => {
  const items: Embedded[] = [
    { id: "p", embedding: vec(0) },
    { id: "q", embedding: vec(30) }, // cos 30° ≈ 0.866 → inside band [0.72, 0.88] → escalate
  ];
  const decide = (sim: number): MergeDecision =>
    sim >= 0.88 ? "merge" : sim >= 0.72 ? "escalate" : "reject";

  it("merges an escalated pair when the adjudicator approves", async () => {
    const res = await clusterByEmbedding(items, {
      decide,
      band: [0.72, 0.88],
      adjudicate: async () => true,
    });
    expect(sortClusters(res.clusters)).toEqual([["p", "q"]]);
    expect(res.borderline).toHaveLength(1);
    expect(res.borderline[0].merged).toBe(true);
  });

  it("keeps an escalated pair apart when the adjudicator rejects", async () => {
    const res = await clusterByEmbedding(items, {
      decide,
      band: [0.72, 0.88],
      adjudicate: async () => false,
    });
    expect(sortClusters(res.clusters)).toEqual([["p"], ["q"]]);
    expect(res.borderline[0].merged).toBe(false);
  });
});

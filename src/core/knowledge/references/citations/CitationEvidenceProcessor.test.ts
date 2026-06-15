import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { CitationEvidenceProcessor } from "./CitationEvidenceProcessor";
import { FetchCacheService } from "../web/FetchCacheService";
import { stubLogger } from "../../../../__tests__/helpers";

// Deterministic embeddings: 2-vector keyed on two marker words so the "right"
// chunk wins the cosine ranking (non-zero everywhere so cosine is defined).
const embeddings = {
  embed: async () => [0.01, 0.01],
  embedBatch: async (texts: string[]) =>
    texts.map((t) => [/mixture|experts/i.test(t) ? 1 : 0.01, /cats/i.test(t) ? 1 : 0.01]),
  clearCache: () => undefined,
  getCacheSize: () => 0,
} as any;

const resolverArxivOnly = {
  resolve: jest.fn(async (c: any) =>
    c.arxivId ? { url: `https://arxiv.org/pdf/${c.arxivId}`, host: "arxiv.org" } : null
  ),
} as any;

const extractMoE = jest.fn(async () => ({
  chunks: ["sparse mixture of experts routing improves capacity", "an unrelated paragraph about cats"],
  graphs: [
    {
      entities: [
        { name: "mixture_of_experts", entityType: "concept", files: [], observations: [{ text: "MoE adds capacity", source: "/tmp/x.pdf" }] },
      ],
      relations: [],
    },
  ],
}));

describe("CitationEvidenceProcessor", () => {
  let tmp: string;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "kgcite-"));
    extractMoE.mockClear();
    resolverArxivOnly.resolve.mockClear();
  });
  afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

  const cache = () => new FetchCacheService(path.join(tmp, "cite.jsonl"), stubLogger());
  const okFetcher = () => ({ fetch: jest.fn(async () => ({ resolved: true, tempPath: "/tmp/x.pdf", status: 200 })) } as any);

  it("resolves an id-bearing citation, fetches OA full text, folds content, marks resolved", async () => {
    const proc = new CitationEvidenceProcessor(
      okFetcher(),
      cache(),
      resolverArxivOnly,
      extractMoE,
      embeddings,
      stubLogger()
    );
    const g = (await proc.process("paper.pdf", "paper.pdf", [
      { raw: "[1] MoE", arxivId: "1701.06538", title: "MoE" },
    ]))!;

    expect(g.relations).toContainEqual(
      expect.objectContaining({ from: "paper.pdf", to: "arXiv:1701.06538", relationType: ["cites"], resolved: true })
    );
    // folded cited-work content, re-stamped to the OA URL
    const moe = g.entities.find((e) => e.name === "mixture_of_experts")!;
    expect(moe.observations[0].source).toBe("https://arxiv.org/pdf/1701.06538");
    // no GROBID claim ⇒ no faithfulness label
    const edge = g.relations.find((r) => r.to === "arXiv:1701.06538")!;
    expect(edge.faithfulness).toBeUndefined();
  });

  it("with GROBID, selects the citing claim's span and labels faithfulness", async () => {
    const grobid = {
      process: jest.fn(async () => [
        { ids: { arxivId: "1701.06538", title: "MoE" }, citingClaim: "model uses sparse mixture of experts", raw: "[1]" },
      ]),
    };
    const faithfulness = { check: jest.fn(async () => ({ score: 0.9, supported: true, checker: "minicheck" })) } as any;
    const proc = new CitationEvidenceProcessor(okFetcher(), cache(), resolverArxivOnly, extractMoE, embeddings, stubLogger(), {
      grobid,
      faithfulness,
      uncertainBand: [0.34, 0.67],
    });

    const g = (await proc.process("paper.pdf", "paper.pdf", []))!;
    expect(grobid.process).toHaveBeenCalledWith("paper.pdf");
    const edge = g.relations.find((r) => r.to === "arXiv:1701.06538")!;
    expect(edge.resolved).toBe(true);
    expect(edge.faithfulness).toBe("supported");
    expect(edge.faithfulnessScore).toBe(0.9);
    expect(edge.supportingSpan).toContain("mixture of experts"); // the right chunk, not the cats one
    // claim was checked against the selected span
    expect(faithfulness.check).toHaveBeenCalledWith("model uses sparse mixture of experts", expect.stringContaining("mixture of experts"));
  });

  it("emits a bare resolved:false cites edge for an unresolvable citation (no fetch)", async () => {
    const fetcher = okFetcher();
    const proc = new CitationEvidenceProcessor(fetcher, cache(), resolverArxivOnly, extractMoE, embeddings, stubLogger());
    const g = (await proc.process("paper.pdf", "paper.pdf", [{ raw: "Foo Bar 2020", title: "Foo Bar 2020" }]))!;
    expect(fetcher.fetch).not.toHaveBeenCalled();
    expect(extractMoE).not.toHaveBeenCalled();
    expect(g.relations).toContainEqual(expect.objectContaining({ to: "Foo Bar 2020", relationType: ["cites"], resolved: false }));
  });

  it("emits resolved:false (no content) when the OA fetch is gated", async () => {
    const fetcher = { fetch: jest.fn(async () => ({ resolved: false, reason: "not-allowlisted" })) } as any;
    const proc = new CitationEvidenceProcessor(fetcher, cache(), resolverArxivOnly, extractMoE, embeddings, stubLogger());
    const g = (await proc.process("paper.pdf", "paper.pdf", [{ raw: "[1]", arxivId: "1701.06538" }]))!;
    expect(extractMoE).not.toHaveBeenCalled();
    const edge = g.relations.find((r) => r.to === "arXiv:1701.06538")!;
    expect(edge.resolved).toBe(false);
  });

  it("reuses the fetch cache and never refetches the same cited work", async () => {
    const c = cache();
    const url = "https://arxiv.org/pdf/1701.06538";
    await c.append({
      url,
      resolved: true,
      fetchedAt: "t",
      graph: {
        entities: [{ name: "arXiv:1701.06538", entityType: "document", files: [], observations: [{ text: "cached content", source: url }] }],
        relations: [{ from: "paper.pdf", to: "arXiv:1701.06538", relationType: ["cites"], source: "paper.pdf", resolved: true }],
      },
    });
    const fetcher = okFetcher();
    const proc = new CitationEvidenceProcessor(fetcher, c, resolverArxivOnly, extractMoE, embeddings, stubLogger());

    const g = (await proc.process("paper.pdf", "paper.pdf", [{ raw: "[1]", arxivId: "1701.06538" }]))!;
    expect(fetcher.fetch).not.toHaveBeenCalled();
    expect(g.relations).toContainEqual(expect.objectContaining({ to: "arXiv:1701.06538", resolved: true }));
  });
});

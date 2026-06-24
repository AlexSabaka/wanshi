import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { CitationEvidenceProcessor, dropReferenceChunks, splitPassages } from "./CitationEvidenceProcessor";
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

  it("abstains from a faithfulness label when the citing sentence co-cites other works", async () => {
    const grobid = {
      process: jest.fn(async () => [
        { ids: { arxivId: "1701.06538", title: "MoE" }, citingClaim: "many works use mixture of experts", soleReferent: false, raw: "[1,2,3]" },
      ]),
    };
    const faithfulness = { check: jest.fn(async () => ({ score: 0.9, supported: true, checker: "minicheck" })) } as any;
    const proc = new CitationEvidenceProcessor(okFetcher(), cache(), resolverArxivOnly, extractMoE, embeddings, stubLogger(), {
      grobid,
      faithfulness,
      uncertainBand: [0.34, 0.67],
    });
    const g = (await proc.process("paper.pdf", "paper.pdf", []))!;
    const edge = g.relations.find((r) => r.to === "arXiv:1701.06538")!;
    expect(edge.resolved).toBe(true); // still fetched + folded
    expect(edge.faithfulness).toBeUndefined(); // but NOT labeled — collective claim
    expect(faithfulness.check).not.toHaveBeenCalled();
    const node = g.entities.find((e) => e.name === "arXiv:1701.06538")!;
    expect(node.observations.some((o) => /not assessed/i.test(o.text))).toBe(true);
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

  it("dropReferenceChunks excludes bibliography chunks, keeps body prose", () => {
    const body =
      "We propose a linear-attention recurrence that scales the model to long contexts " +
      "while keeping inference cheap, and show it matches transformer quality on language modeling.";
    const refs =
      "References Vaswani et al. 2017. Attention is all you need. In Advances in Neural " +
      "Information Processing Systems. Devlin et al. 2019. BERT. In Proceedings of NAACL, pp. 4171. " +
      "Brown et al. 2020. Language models are few-shot learners. arXiv:2005.14165. doi.org/10.5555/x.";
    expect(dropReferenceChunks([body, refs])).toEqual([body]);
    // all-references ⇒ fall back to the full set rather than returning nothing
    expect(dropReferenceChunks([refs])).toEqual([refs]);
  });

  it("splitPassages breaks a page into focused passages and hard-splits space-less runs", () => {
    const short = "One short paragraph.";
    expect(splitPassages(short)).toEqual([short]);
    // sentence packing to ~target
    const sentences = Array.from({ length: 12 }, (_, i) => `Sentence number ${i} explains a point.`).join(" ");
    const packed = splitPassages(sentences, 120);
    expect(packed.length).toBeGreaterThan(1);
    expect(Math.max(...packed.map((p) => p.length))).toBeLessThan(120 * 1.8);
    // pdf2json run with no spaces/sentence breaks → hard-windowed, not one giant span
    const run = "x".repeat(5000);
    const windows = splitPassages(run, 700);
    expect(windows.length).toBeGreaterThan(3);
  });

  it("dropReferenceChunks cuts the trailing section at a References heading (any entry format)", () => {
    // GitHub/URL-style refs have low academic-venue density — only the heading cut catches them.
    const b1 = "Section 1. ".padEnd(400, "x");
    const b2 = "Section 2 discusses the routing mechanism in detail. ".padEnd(400, "y");
    const refs = "References\nEric J. Wang. 2023. alpaca-lora. https://github.com/tloen/alpaca-lora\nYizhong Wang et al. 2023.";
    expect(dropReferenceChunks([b1, b2, refs])).toEqual([b1, b2]); // heading chunk (past 60%) dropped
  });

  it("with GROBID, span-select ignores the cited work's bibliography chunk", async () => {
    const grobid = {
      process: jest.fn(async () => [
        { ids: { arxivId: "1701.06538", title: "MoE" }, citingClaim: "model uses sparse mixture of experts", raw: "[1]" },
      ]),
    };
    const faithfulness = { check: jest.fn(async () => ({ score: 0.9, supported: true, checker: "minicheck" })) } as any;
    // The fetched work's chunks: a relevant BODY chunk + a dense reference-list chunk.
    const extract = jest.fn(async () => ({
      chunks: [
        "We route tokens through a sparse mixture of experts to scale capacity efficiently.",
        "References Shazeer et al. 2017. arXiv:1701.06538. Lepikhin et al. 2020. In Proceedings, pp. 12. doi.org/10.5/x. et al.",
      ],
      graphs: [],
    }));
    const proc = new CitationEvidenceProcessor(okFetcher(), cache(), resolverArxivOnly, extract, embeddings, stubLogger(), {
      grobid,
      faithfulness,
      uncertainBand: [0.34, 0.67],
    });
    const g = (await proc.process("paper.pdf", "paper.pdf", []))!;
    const edge = g.relations.find((r) => r.to === "arXiv:1701.06538")!;
    expect(edge.supportingSpan).toContain("sparse mixture of experts"); // body chunk, not the References one
    expect(edge.supportingSpan).not.toContain("References Shazeer");
  });

  it("reuses the cached CONTENT and never refetches the same cited work", async () => {
    const c = cache();
    const url = "https://arxiv.org/pdf/1701.06538";
    await c.append({
      url,
      resolved: true,
      fetchedAt: new Date().toISOString(),
      citationContent: {
        chunks: ["sparse mixture of experts routing improves capacity"],
        graphs: [
          {
            entities: [{ name: "mixture_of_experts", entityType: "concept", files: [], observations: [{ text: "cached content", source: url }] }],
            relations: [],
          },
        ],
        resolved: true,
      },
    });
    const fetcher = okFetcher();
    const proc = new CitationEvidenceProcessor(fetcher, c, resolverArxivOnly, extractMoE, embeddings, stubLogger());

    const g = (await proc.process("paper.pdf", "paper.pdf", [{ raw: "[1]", arxivId: "1701.06538" }]))!;
    expect(fetcher.fetch).not.toHaveBeenCalled();
    expect(g.relations).toContainEqual(expect.objectContaining({ to: "arXiv:1701.06538", resolved: true }));
  });

  // WS-04: a work cited by two docs (with different claims) is fetched once but
  // JUDGED per (citingDoc, claim) — judge() runs again for the second doc.
  it("re-judges per citing doc on a cache hit (WS-04), not a single per-URL verdict", async () => {
    const c = cache();
    const arxivId = "1701.06538";
    // Two GROBID contexts for the SAME work — one supported claim, one unsupported.
    const grobidFor = (claim: string) => ({
      process: jest.fn(async () => [{ ids: { arxivId, title: "MoE" }, citingClaim: claim, raw: "[1]" }]),
    });
    // Mock judge returns a score keyed on the claim text → distinct verdicts.
    const faithfulness = {
      check: jest.fn(async (claim: string) => ({
        score: /FAITHFUL/.test(claim) ? 0.95 : 0.05,
        supported: /FAITHFUL/.test(claim),
        checker: "minicheck" as const,
      })),
    } as any;
    const fetcher = okFetcher();
    const mk = (claim: string) =>
      new CitationEvidenceProcessor(fetcher, c, resolverArxivOnly, extractMoE, embeddings, stubLogger(), {
        grobid: grobidFor(claim),
        faithfulness,
        uncertainBand: [0.34, 0.67],
      });

    const gA = (await mk("docA FAITHFUL mixture of experts claim").process("docA.pdf", "docA.pdf", []))!;
    const gB = (await mk("docB DUBIOUS mixture of experts claim").process("docB.pdf", "docB.pdf", []))!;

    // Fetched exactly once (docB reused docA's cached content) ...
    expect(fetcher.fetch).toHaveBeenCalledTimes(1);
    // ... but judged for BOTH docs → different verdicts.
    expect(faithfulness.check).toHaveBeenCalledTimes(2);
    const edgeA = gA.relations.find((r) => r.to === `arXiv:${arxivId}`)!;
    const edgeB = gB.relations.find((r) => r.to === `arXiv:${arxivId}`)!;
    expect(edgeA.faithfulness).toBe("supported");
    expect(edgeB.faithfulness).toBe("unsupported");
  });

  // WS-03: a transient OA-fetch failure (timeout) is NOT cached permanently — it
  // expires, so a later run retries; a deterministic negative is cached forever.
  it("does not permanently cache a transient citation-fetch failure (WS-03)", async () => {
    // Records stamp `fetchedAt` with the real wall-clock; anchor the injected
    // clock to "now" so we can advance past the TTL relative to that stamp.
    const clock = { now: Date.now() };
    const c = new FetchCacheService(path.join(tmp, "cite.jsonl"), stubLogger(), () => clock.now);
    const timeoutFetcher = { fetch: jest.fn(async () => ({ resolved: false, reason: "timeout", status: 0 })) } as any;
    const proc = new CitationEvidenceProcessor(timeoutFetcher, c, resolverArxivOnly, extractMoE, embeddings, stubLogger());
    await proc.process("paper.pdf", "paper.pdf", [{ raw: "[1]", arxivId: "1701.06538" }]);

    const url = "https://arxiv.org/pdf/1701.06538";
    expect(c.get(url)).toBeDefined(); // cached within the TTL window
    clock.now += 7 * 60 * 60 * 1000; // advance past the 6h transient TTL
    expect(c.get(url)).toBeUndefined(); // expired → a later run will retry
  });

  it("permanently caches a DETERMINISTIC negative citation fetch (WS-03)", async () => {
    const clock = { now: Date.now() };
    const c = new FetchCacheService(path.join(tmp, "cite.jsonl"), stubLogger(), () => clock.now);
    const gatedFetcher = { fetch: jest.fn(async () => ({ resolved: false, reason: "not-allowlisted" })) } as any;
    const proc = new CitationEvidenceProcessor(gatedFetcher, c, resolverArxivOnly, extractMoE, embeddings, stubLogger());
    await proc.process("paper.pdf", "paper.pdf", [{ raw: "[1]", arxivId: "1701.06538" }]);

    const url = "https://arxiv.org/pdf/1701.06538";
    clock.now += 100 * 60 * 60 * 1000; // far past any TTL
    expect(c.get(url)).toBeDefined(); // deterministic negatives never expire
  });

  // WS-18: when the faithfulness checker degrades to a keyword fallback (NLI
  // didn't run), abstain — no label.
  it("abstains from a faithfulness label when the checker degraded to keyword (WS-18)", async () => {
    const grobid = {
      process: jest.fn(async () => [
        { ids: { arxivId: "1701.06538", title: "MoE" }, citingClaim: "model uses sparse mixture of experts", raw: "[1]" },
      ]),
    };
    // The checker reports a keyword fallback (its NLI model was unavailable).
    const faithfulness = { check: jest.fn(async () => ({ score: 0.1, supported: false, checker: "keyword" })) } as any;
    const proc = new CitationEvidenceProcessor(okFetcher(), cache(), resolverArxivOnly, extractMoE, embeddings, stubLogger(), {
      grobid,
      faithfulness,
      uncertainBand: [0.34, 0.67],
    });
    const g = (await proc.process("paper.pdf", "paper.pdf", []))!;
    const edge = g.relations.find((r) => r.to === "arXiv:1701.06538")!;
    expect(faithfulness.check).toHaveBeenCalled();
    expect(edge.faithfulness).toBeUndefined(); // abstained, not labeled unsupported
  });
});

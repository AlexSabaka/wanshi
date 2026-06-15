import { CitationResolver, ITitleIdResolver } from "./CitationResolver";
import { stubLogger } from "../../../../__tests__/helpers";

const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json" } });

describe("CitationResolver", () => {
  it("maps an arXiv id straight to the PDF URL (no network)", async () => {
    const fetchFn = jest.fn();
    const r = new CitationResolver({}, stubLogger(), null, fetchFn as any);
    expect(await r.resolve({ arxivId: "1706.03762" })).toEqual({
      url: "https://arxiv.org/pdf/1706.03762",
      host: "arxiv.org",
    });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("resolves a DOI via Unpaywall best_oa_location", async () => {
    const fetchFn = jest.fn(async () =>
      json({ best_oa_location: { url_for_pdf: "https://oa.example.org/x.pdf" } })
    );
    const r = new CitationResolver({ unpaywallEmail: "me@x.org" }, stubLogger(), null, fetchFn as any);
    const t = await r.resolve({ doi: "10.1/abc" });
    expect(t).toEqual({ url: "https://oa.example.org/x.pdf", host: "oa.example.org" });
    expect((fetchFn.mock.calls[0] as any[])[0]).toContain("api.unpaywall.org");
  });

  it("skips DOI resolution (no network) when no Unpaywall email is configured", async () => {
    const fetchFn = jest.fn();
    const r = new CitationResolver({}, stubLogger(), null, fetchFn as any);
    expect(await r.resolve({ doi: "10.1/abc" })).toBeNull();
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("resolves a PMID to a PMC PDF via the id-converter", async () => {
    const fetchFn = jest.fn(async () => json({ records: [{ pmcid: "PMC123" }] }));
    const r = new CitationResolver({}, stubLogger(), null, fetchFn as any);
    const t = await r.resolve({ pmid: "987" });
    expect(t?.url).toBe("https://www.ncbi.nlm.nih.gov/pmc/articles/PMC123/pdf/");
  });

  it("falls through to the title resolver for an id-less citation", async () => {
    const titleResolver: ITitleIdResolver = {
      resolve: jest.fn(async () => ({ arxivId: "2305.13048" })),
    };
    const r = new CitationResolver({}, stubLogger(), titleResolver, jest.fn() as any);
    const t = await r.resolve({ title: "RWKV: Reinventing RNNs" });
    expect(titleResolver.resolve).toHaveBeenCalled();
    expect(t).toEqual({ url: "https://arxiv.org/pdf/2305.13048", host: "arxiv.org" });
  });

  it("returns null for an id-less citation with no title resolver", async () => {
    const r = new CitationResolver({}, stubLogger(), null, jest.fn() as any);
    expect(await r.resolve({ title: "Some Paper" })).toBeNull();
  });
});

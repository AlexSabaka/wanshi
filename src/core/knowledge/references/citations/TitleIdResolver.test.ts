import { TitleIdResolver } from "./TitleIdResolver";
import { stubLogger } from "../../../../__tests__/helpers";

const json = (obj: unknown) =>
  new Response(JSON.stringify(obj), { status: 200, headers: { "content-type": "application/json" } });

const TITLE = "Attention Is All You Need";

describe("TitleIdResolver", () => {
  const opts = { minTitleSimilarity: 0.85, mailto: "me@x.org" };

  it("returns the Crossref DOI when the title matches above threshold", async () => {
    const fetchFn = jest.fn(async () =>
      json({ message: { items: [{ DOI: "10.5555/attn", title: ["Attention Is All You Need"] }] } })
    );
    const r = new TitleIdResolver(opts, stubLogger(), fetchFn as any);
    expect(await r.resolve(TITLE)).toEqual({ doi: "10.5555/attn" });
  });

  it("rejects a loose Crossref match below the similarity threshold, cascades onward", async () => {
    const fetchFn = jest
      .fn()
      // Crossref: wrong paper → rejected by threshold
      .mockResolvedValueOnce(json({ message: { items: [{ DOI: "10.9/other", title: ["A Totally Different Paper"] }] } }))
      // Semantic Scholar: correct paper with an arXiv id
      .mockResolvedValueOnce(json({ data: [{ title: TITLE, externalIds: { ArXiv: "1706.03762" } }] }));
    const r = new TitleIdResolver(opts, stubLogger(), fetchFn as any);
    expect(await r.resolve(TITLE)).toEqual({ arxivId: "1706.03762" });
    expect(fetchFn).toHaveBeenCalledTimes(2); // crossref miss → S2 hit
  });

  it("returns null when no source matches", async () => {
    const fetchFn = jest.fn(async () => json({ message: { items: [] }, data: [], results: [] }));
    const r = new TitleIdResolver(opts, stubLogger(), fetchFn as any);
    expect(await r.resolve(TITLE)).toBeNull();
    expect(fetchFn).toHaveBeenCalledTimes(3); // crossref → s2 → openalex
  });

  it("does not query for a too-short title", async () => {
    const fetchFn = jest.fn();
    const r = new TitleIdResolver(opts, stubLogger(), fetchFn as any);
    expect(await r.resolve("RNN")).toBeNull();
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

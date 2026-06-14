import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { WebReferenceProcessor } from "./WebReferenceProcessor";
import { FetchCacheService } from "./FetchCacheService";
import { stubLogger } from "../../../../__tests__/helpers";

describe("WebReferenceProcessor", () => {
  let tmp: string;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "kgwrp-"));
  });
  afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

  const cache = () => new FetchCacheService(path.join(tmp, "c.jsonl"), stubLogger());
  const URL = "https://example.com/p";

  it("fetches external links, extracts, and emits a resolved references edge", async () => {
    const fetcher = {
      fetch: jest.fn(async () => ({ resolved: true, tempPath: "/nope.html", title: "T", status: 200 })),
    } as any;
    const extract = jest.fn(async () => [
      {
        entities: [
          { name: "Concept", entityType: "concept", files: [], observations: [{ text: "fact", source: "/nope.html" }] },
        ],
        relations: [],
      },
    ]);
    const proc = new WebReferenceProcessor(fetcher, cache(), extract, stubLogger());

    const g = (await proc.process(
      "doc.md",
      [{ target: URL, kind: "url" }, { target: "./local.md", kind: "markdown" }],
      "scope"
    ))!;

    expect(fetcher.fetch).toHaveBeenCalledTimes(1); // internal ./local.md ignored
    expect(extract).toHaveBeenCalledWith("/nope.html", URL);
    expect(g.relations).toContainEqual(
      expect.objectContaining({ from: "doc.md", to: URL, relationType: ["references"], resolved: true })
    );
    const concept = g.entities.find((e) => e.name === "Concept")!;
    expect(concept.observations[0].source).toBe(URL); // re-stamped from temp path to URL
    expect(g.entities.map((e) => e.name)).toContain(URL); // url document node
  });

  it("emits a resolved:false edge + stub node when the fetch is gated", async () => {
    const fetcher = { fetch: jest.fn(async () => ({ resolved: false, reason: "not-allowlisted" })) } as any;
    const extract = jest.fn();
    const proc = new WebReferenceProcessor(fetcher, cache(), extract, stubLogger());

    const g = (await proc.process("doc.md", [{ target: URL, kind: "url" }], "scope"))!;
    expect(extract).not.toHaveBeenCalled();
    expect(g.relations).toContainEqual(expect.objectContaining({ to: URL, resolved: false }));
    expect(g.entities.map((e) => e.name)).toContain(URL); // bare stub node, no page content
  });

  it("reuses the cache and never refetches", async () => {
    const c = cache();
    await c.append({
      url: URL,
      resolved: true,
      fetchedAt: "t",
      graph: {
        entities: [{ name: URL, entityType: "document", files: [], observations: [] }],
        relations: [{ from: "doc.md", to: URL, relationType: ["references"], resolved: true }],
      },
    });
    const fetcher = { fetch: jest.fn() } as any;
    const proc = new WebReferenceProcessor(fetcher, c, jest.fn(), stubLogger());

    const g = (await proc.process("doc.md", [{ target: URL, kind: "url" }], "scope"))!;
    expect(fetcher.fetch).not.toHaveBeenCalled();
    expect(g.relations).toContainEqual(expect.objectContaining({ to: URL, resolved: true }));
  });

  it("returns null when there are no external links", async () => {
    const proc = new WebReferenceProcessor({ fetch: jest.fn() } as any, cache(), jest.fn(), stubLogger());
    expect(await proc.process("doc.md", [{ target: "./a.md", kind: "markdown" }], "s")).toBeNull();
  });
});

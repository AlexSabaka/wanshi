import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { GatedFetcher, GatedFetcherOptions } from "./GatedFetcher";
import { stubLogger } from "../../../../__tests__/helpers";

const stubLlm = (relevant = true) =>
  ({
    generateStructured: async () => ({ relevant }),
    getModelCapabilities: async () => [],
  } as any);

const baseOpts = (over: Partial<GatedFetcherOptions> = {}): GatedFetcherOptions => ({
  allowlist: ["example.com"],
  rejectlist: [],
  maxFetches: 50,
  timeoutMs: 1000,
  maxBytes: 1_000_000,
  relevanceCheck: false,
  robots: false,
  ...over,
});

const html = (title: string) => `<html><head><title>${title}</title></head><body>hi</body></html>`;
const resp = (body: string, ct = "text/html", status = 200) =>
  new Response(body, { status, headers: { "content-type": ct } });
const redirect = (location: string, status = 301) =>
  new Response(null, { status, headers: { location } });

describe("GatedFetcher", () => {
  let tmp: string;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "kggf-"));
  });
  afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

  const make = (opts: GatedFetcherOptions, fetchFn: any, llm = stubLlm()) =>
    new GatedFetcher(opts, llm, stubLogger(), tmp, fetchFn);

  it("does NOT touch the network for an off-allowlist URL", async () => {
    const fetchFn = jest.fn();
    const r = await make(baseOpts(), fetchFn).fetch("https://evil.com/x", "scope");
    expect(r).toMatchObject({ resolved: false, reason: "not-allowlisted" });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("fetches an allowlisted html page and stages a temp file", async () => {
    const fetchFn = jest.fn(async () => resp(html("Hello")));
    const r = await make(baseOpts(), fetchFn).fetch("https://example.com/p", "scope");
    expect(r.resolved).toBe(true);
    expect(r.title).toBe("Hello");
    expect(fs.existsSync(r.tempPath!)).toBe(true);
  });

  it("rejects non-html content types without staging", async () => {
    const fetchFn = jest.fn(async () => resp("%PDF...", "application/pdf"));
    const r = await make(baseOpts(), fetchFn).fetch("https://example.com/f.pdf", "scope");
    expect(r).toMatchObject({ resolved: false });
    expect(r.reason).toMatch(/content-type/);
  });

  it("accepts application/pdf and stages a binary .pdf when allowPdf is set", async () => {
    const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]); // %PDF-
    const fetchFn = jest.fn(
      async () => new Response(bytes, { status: 200, headers: { "content-type": "application/pdf" } })
    );
    const r = await make(baseOpts({ allowPdf: true }), fetchFn).fetch("https://example.com/f.pdf", "s");
    expect(r.resolved).toBe(true);
    expect(r.tempPath).toMatch(/\.pdf$/);
    expect(fs.readFileSync(r.tempPath!)).toEqual(Buffer.from(bytes)); // bytes verbatim, no utf-8 mangling
  });

  it("rejects oversize bodies", async () => {
    const fetchFn = jest.fn(async () => resp(html("x".repeat(5000))));
    const r = await make(baseOpts({ maxBytes: 100 }), fetchFn).fetch("https://example.com/p", "scope");
    expect(r).toMatchObject({ resolved: false, reason: "too-large" });
  });

  it("maps an aborted fetch to a timeout reason", async () => {
    const fetchFn = jest.fn(async () => {
      const e: any = new Error("aborted");
      e.name = "AbortError";
      throw e;
    });
    const r = await make(baseOpts(), fetchFn).fetch("https://example.com/p", "scope");
    expect(r).toMatchObject({ resolved: false, reason: "timeout" });
  });

  it("enforces the per-run fetch budget", async () => {
    const fetchFn = jest.fn(async () => resp(html("ok")));
    const f = make(baseOpts({ maxFetches: 1 }), fetchFn);
    expect((await f.fetch("https://example.com/a", "s")).resolved).toBe(true);
    const second = await f.fetch("https://example.com/b", "s");
    expect(second).toMatchObject({ resolved: false, reason: "budget-exceeded" });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("skips when the relevance gate says no", async () => {
    const fetchFn = jest.fn(async () => resp(html("Off topic")));
    const r = await make(baseOpts({ relevanceCheck: true }), fetchFn, stubLlm(false)).fetch(
      "https://example.com/p",
      "ML papers"
    );
    expect(r).toMatchObject({ resolved: false, reason: "irrelevant" });
  });

  it("honors robots.txt Disallow", async () => {
    const fetchFn = jest.fn(async (url: string) =>
      url.endsWith("/robots.txt")
        ? resp("User-agent: *\nDisallow: /private", "text/plain")
        : resp(html("secret"))
    );
    const r = await make(baseOpts({ robots: true }), fetchFn).fetch(
      "https://example.com/private/x",
      "s"
    );
    expect(r).toMatchObject({ resolved: false, reason: "robots-disallow" });
  });

  // WS-02 — origin/pathname allowlist match (no raw string-prefix bypass).
  describe("allowlist URL-prefix matching (WS-02)", () => {
    it("rejects a look-alike host that shares a string prefix with the allowlist", async () => {
      const fetchFn = jest.fn();
      const r = await make(baseOpts({ allowlist: ["https://arxiv.org"] }), fetchFn).fetch(
        "https://arxiv.org.evil.com/paper",
        "s"
      );
      expect(r).toMatchObject({ resolved: false, reason: "not-allowlisted" });
      expect(fetchFn).not.toHaveBeenCalled();
    });

    it("accepts a legitimate URL under the allowlisted origin", async () => {
      const fetchFn = jest.fn(async () => resp(html("Paper")));
      const r = await make(baseOpts({ allowlist: ["https://arxiv.org"] }), fetchFn).fetch(
        "https://arxiv.org/paper",
        "s"
      );
      expect(r.resolved).toBe(true);
    });

    it("honors a pathname prefix in a URL-prefix allowlist entry", async () => {
      const fetchFn = jest.fn(async () => resp(html("Docs")));
      const f = make(baseOpts({ allowlist: ["https://x.io/docs"] }), fetchFn);
      expect((await f.fetch("https://x.io/docs/intro", "s")).resolved).toBe(true);
      const off = await f.fetch("https://x.io/blog/post", "s");
      expect(off).toMatchObject({ resolved: false, reason: "not-allowlisted" });
    });
  });

  // WS-15 — manual redirect handling with per-hop SSRF validation.
  describe("redirect handling (WS-15)", () => {
    it("rejects a redirect from an allowed origin to loopback", async () => {
      const fetchFn = jest.fn(async (url: string) =>
        url === "https://example.com/p"
          ? redirect("http://localhost:8080/internal")
          : resp(html("internal"))
      );
      const r = await make(baseOpts(), fetchFn).fetch("https://example.com/p", "s");
      expect(r).toMatchObject({ resolved: false, reason: "redirect-blocked" });
    });

    it("rejects a redirect to an RFC1918 private address", async () => {
      const fetchFn = jest.fn(async (url: string) =>
        url === "https://example.com/p"
          ? redirect("http://10.0.0.5/meta")
          : resp(html("private"))
      );
      const r = await make(baseOpts(), fetchFn).fetch("https://example.com/p", "s");
      expect(r).toMatchObject({ resolved: false, reason: "redirect-blocked" });
    });

    it("rejects a redirect to the cloud metadata address", async () => {
      const fetchFn = jest.fn(async (url: string) =>
        url === "https://example.com/p"
          ? redirect("http://169.254.169.254/latest/meta-data/")
          : resp(html("meta"))
      );
      const r = await make(baseOpts(), fetchFn).fetch("https://example.com/p", "s");
      expect(r).toMatchObject({ resolved: false, reason: "redirect-blocked" });
    });

    it("rejects a redirect to an off-allowlist (public) host", async () => {
      const fetchFn = jest.fn(async (url: string) =>
        url === "https://example.com/p" ? redirect("https://evil.com/x") : resp(html("x"))
      );
      const r = await make(baseOpts({ allowlist: ["example.com"] }), fetchFn).fetch(
        "https://example.com/p",
        "s"
      );
      expect(r).toMatchObject({ resolved: false, reason: "redirect-blocked" });
    });

    it("follows a redirect to another allowed origin and stages it", async () => {
      const fetchFn = jest.fn(async (url: string) =>
        url === "https://example.com/a"
          ? redirect("https://example.com/b")
          : resp(html("Landed"))
      );
      const r = await make(baseOpts({ allowlist: ["example.com"] }), fetchFn).fetch(
        "https://example.com/a",
        "s"
      );
      expect(r.resolved).toBe(true);
      expect(r.title).toBe("Landed");
    });
  });

  // WS-34 — opt-in fail-closed mode (default stays fail-open / byte-identical).
  describe("fail-closed mode (WS-34)", () => {
    const robotsErr = (mainBody: string) =>
      jest.fn(async (url: string) => {
        if (url.endsWith("/robots.txt")) throw new Error("ECONNREFUSED");
        return resp(mainBody);
      });

    it("defaults to fail-open when robots.txt is unreachable", async () => {
      const fetchFn = robotsErr(html("ok"));
      const r = await make(baseOpts({ robots: true }), fetchFn).fetch(
        "https://example.com/p",
        "s"
      );
      expect(r.resolved).toBe(true);
    });

    it("blocks when robots.txt is unreachable and failClosed is set", async () => {
      const fetchFn = robotsErr(html("ok"));
      const r = await make(baseOpts({ robots: true, failClosed: true }), fetchFn).fetch(
        "https://example.com/p",
        "s"
      );
      expect(r).toMatchObject({ resolved: false, reason: "robots-disallow" });
    });

    it("does NOT cache a transport-error robots result (re-checks next call)", async () => {
      let robotsHits = 0;
      const fetchFn = jest.fn(async (url: string) => {
        if (url.endsWith("/robots.txt")) {
          robotsHits++;
          throw new Error("ECONNREFUSED");
        }
        return resp(html("ok"));
      });
      const f = make(baseOpts({ robots: true }), fetchFn);
      await f.fetch("https://example.com/a", "s");
      await f.fetch("https://example.com/b", "s");
      expect(robotsHits).toBe(2); // failure not cached
    });

    it("defaults to fail-open (relevant) when the relevance LLM errors", async () => {
      const llm = { generateStructured: async () => { throw new Error("LLM down"); } } as any;
      const fetchFn = jest.fn(async () => resp(html("topic")));
      const r = await make(baseOpts({ relevanceCheck: true }), fetchFn, llm).fetch(
        "https://example.com/p",
        "ML"
      );
      expect(r.resolved).toBe(true);
    });

    it("blocks (irrelevant) when the relevance LLM errors and failClosed is set", async () => {
      const llm = { generateStructured: async () => { throw new Error("LLM down"); } } as any;
      const fetchFn = jest.fn(async () => resp(html("topic")));
      const r = await make(
        baseOpts({ relevanceCheck: true, failClosed: true }),
        fetchFn,
        llm
      ).fetch("https://example.com/p", "ML");
      expect(r).toMatchObject({ resolved: false, reason: "irrelevant" });
    });
  });
});

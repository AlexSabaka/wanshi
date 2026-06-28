import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  FetchCacheService,
  isTransientFetchReason,
  DEFAULT_TRANSIENT_TTL_MS,
} from "./FetchCacheService";
import { stubLogger } from "../../../../__tests__/helpers";

describe("FetchCacheService", () => {
  let tmp: string;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "kgfetch-"));
  });
  afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

  it("appends + reads back outcomes by URL, ensuring the parent dir", async () => {
    const p = path.join(tmp, "nested", "out.fetch-cache.jsonl");
    const c = new FetchCacheService(p, stubLogger());
    expect(c.has("https://x")).toBe(false);
    await c.append({ url: "https://x", resolved: true, fetchedAt: "t", status: 200 });
    expect(c.has("https://x")).toBe(true);
    expect(c.get("https://x")?.resolved).toBe(true);

    const reloaded = new FetchCacheService(p, stubLogger());
    expect(await reloaded.load()).toBe(1);
    expect(reloaded.get("https://x")?.status).toBe(200);
  });

  it("load tolerates a truncated final line", async () => {
    const p = path.join(tmp, "c.jsonl");
    fs.writeFileSync(
      p,
      JSON.stringify({ url: "https://a", resolved: false, fetchedAt: "t" }) +
        "\n" +
        '{"url":"https://b","resolved":tru' // truncated
    );
    const c = new FetchCacheService(p, stubLogger());
    expect(await c.load()).toBe(1);
    expect(c.has("https://a")).toBe(true);
    expect(c.has("https://b")).toBe(false);
  });

  // WS-03: transient failures expire (so a later run retries); deterministic
  // negatives and successes are cached indefinitely.
  describe("transient-failure TTL (WS-03)", () => {
    it("expires a transient record after its TTL (injected clock)", async () => {
      const clock = { now: Date.parse("2026-01-01T00:00:00Z") };
      const c = new FetchCacheService(path.join(tmp, "t.jsonl"), stubLogger(), () => clock.now);
      await c.append({ url: "https://x", resolved: false, reason: "timeout", transient: true, fetchedAt: new Date(clock.now).toISOString() });
      expect(c.get("https://x")).toBeDefined(); // within window
      expect(c.has("https://x")).toBe(true);
      clock.now += DEFAULT_TRANSIENT_TTL_MS + 1; // advance past TTL
      expect(c.get("https://x")).toBeUndefined(); // expired → cache miss
      expect(c.has("https://x")).toBe(false);
    });

    it("never expires a deterministic negative (transient absent)", async () => {
      const clock = { now: Date.parse("2026-01-01T00:00:00Z") };
      const c = new FetchCacheService(path.join(tmp, "d.jsonl"), stubLogger(), () => clock.now);
      await c.append({ url: "https://y", resolved: false, reason: "not-allowlisted", fetchedAt: new Date(clock.now).toISOString() });
      clock.now += DEFAULT_TRANSIENT_TTL_MS * 100;
      expect(c.get("https://y")).toBeDefined(); // permanent
    });

    it("honors a per-record transientTtlMs override", async () => {
      const clock = { now: Date.parse("2026-01-01T00:00:00Z") };
      const c = new FetchCacheService(path.join(tmp, "o.jsonl"), stubLogger(), () => clock.now);
      await c.append({ url: "https://z", resolved: false, reason: "http-503", transient: true, transientTtlMs: 1000, fetchedAt: new Date(clock.now).toISOString() });
      clock.now += 500;
      expect(c.get("https://z")).toBeDefined();
      clock.now += 600; // total 1100 > 1000
      expect(c.get("https://z")).toBeUndefined();
    });
  });

  describe("isTransientFetchReason (WS-03)", () => {
    it("treats deterministic negatives as permanent", () => {
      for (const r of ["not-allowlisted", "robots-disallow", "too-large", "irrelevant", "content-type:image/png", "http-404", "http-403"]) {
        expect(isTransientFetchReason(r)).toBe(false);
      }
    });
    it("treats outages as transient", () => {
      for (const r of ["timeout", "fetch-error", "http-429", "http-500", "http-503", "budget-exceeded", undefined as any, "weird-unknown"]) {
        expect(isTransientFetchReason(r)).toBe(true);
      }
    });
  });
});

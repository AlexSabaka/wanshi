import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { FetchCacheService } from "./FetchCacheService";
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
});

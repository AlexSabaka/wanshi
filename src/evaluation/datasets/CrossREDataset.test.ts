import * as path from "path";
import { CrossREDataset } from "./CrossREDataset";

const FIX = path.join(__dirname, "__fixtures__", "crossre"); // ai-test.json + news-test.json, 2 rows each

describe("CrossREDataset", () => {
  it("spans multiple domains under a finite limit (WS-01)", async () => {
    const samples = await new CrossREDataset().load(FIX, 3);
    expect(samples).toHaveLength(3);
    // Before WS-01, file 1 (ai) filled `out`, so the cumulative guard broke file 2
    // (news) on iteration 0 → a finite limit collapsed to the first domain only.
    expect(new Set(samples.map((s) => s.domain))).toEqual(new Set(["ai", "news"]));
  });

  it("returns every row when the limit exceeds the corpus", async () => {
    const samples = await new CrossREDataset().load(FIX, 100);
    expect(samples).toHaveLength(4);
    expect(new Set(samples.map((s) => s.domain))).toEqual(new Set(["ai", "news"]));
  });

  it("respects a single-domain filter", async () => {
    const samples = await new CrossREDataset().load(FIX, 100, "news");
    expect(samples).toHaveLength(2);
    expect(new Set(samples.map((s) => s.domain))).toEqual(new Set(["news"]));
  });
});

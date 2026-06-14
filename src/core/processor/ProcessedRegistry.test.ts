import { ProcessedRegistry } from "./ProcessedRegistry";

describe("ProcessedRegistry", () => {
  it("gates by path id (has false until marked, true after)", () => {
    const r = new ProcessedRegistry();
    expect(r.has("docs/a.md")).toBe(false);
    r.mark("docs/a.md");
    expect(r.has("docs/a.md")).toBe(true);
    expect(r.has("docs/b.md")).toBe(false);
    expect(r.size).toBe(1);
  });

  it("mark is idempotent", () => {
    const r = new ProcessedRegistry();
    r.mark("docs/a.md");
    r.mark("docs/a.md");
    expect(r.size).toBe(1);
  });

  it("content-hash secondary catches identical content under a different path", () => {
    const r = new ProcessedRegistry();
    r.mark("docs/a.md", "deadbeef");
    expect(r.has("docs/copy.md", "deadbeef")).toBe(true); // same content
    expect(r.has("docs/copy.md")).toBe(false); // path alone is new
    expect(r.has("docs/copy.md", "feedface")).toBe(false); // different content
  });
});

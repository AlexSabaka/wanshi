import { StructuredAdapterRegistry } from "./StructuredAdapterRegistry";
import { IStructuredAdapter } from "./IStructuredAdapter";

const fakeAdapter = (id: string, ext: string): IStructuredAdapter => ({
  id,
  canHandle: (f) => f.toLowerCase().endsWith(ext),
  extract: async () => ({
    entities: [
      { name: "X", entityType: "t", files: [], observations: [{ text: "o", sourceAdapter: id, locator: "loc" }] },
    ],
    relations: [],
  }),
});

describe("StructuredAdapterRegistry", () => {
  it("is empty by default (default run unaffected)", () => {
    const reg = new StructuredAdapterRegistry();
    expect(reg.size).toBe(0);
    expect(reg.match("x.db")).toBeNull();
  });

  it("matches the first registered adapter that claims a file", () => {
    const reg = new StructuredAdapterRegistry();
    reg.register(fakeAdapter("sqlite", ".db"));
    reg.register(fakeAdapter("openapi", ".yaml"));
    expect(reg.match("/x/data.db")?.id).toBe("sqlite");
    expect(reg.match("/x/spec.yaml")?.id).toBe("openapi");
    expect(reg.match("/x/notes.md")).toBeNull();
  });

  it("respects registration order on overlap (first wins)", () => {
    const reg = new StructuredAdapterRegistry();
    reg.register(fakeAdapter("a", ".db"));
    reg.register(fakeAdapter("b", ".db"));
    expect(reg.match("/x/data.db")?.id).toBe("a");
    expect(reg.size).toBe(2);
  });

  it("emits a graph fragment whose observations carry sourceAdapter + locator", async () => {
    const g = await fakeAdapter("sqlite", ".db").extract("x.db");
    expect(g!.entities[0].observations[0]).toMatchObject({ sourceAdapter: "sqlite", locator: "loc" });
  });
});

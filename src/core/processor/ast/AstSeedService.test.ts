import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { AstSeedService } from "./AstSeedService";
import { AstSymbolStore } from "./AstSymbolStore";
import { hashContent } from "../../../shared/utils/astSymbols";
import { allowedEntityTypes, allowedRelationTypes } from "../../knowledge/vocabulary";
import { ProcessedFile } from "../../../types";
import { stubLogger } from "../../../__tests__/helpers";

const TS = `import { z } from "./z";
export function countTerms(text) { return helper(text); }
function helper(t) { return t; }
export const VERSION = "1.0";
let scratch = 0;
export class Tokenizer {
  private secret = 1;
  tokenize(s) { return countTerms(s); }
}
`;

describe("AstSeedService (Phase 8)", () => {
  let tmp: string;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "kgast-"));
  });
  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  const service = () => new AstSeedService(new AstSymbolStore(path.join(tmp, "c.json"), stubLogger()), stubLogger(), tmp);
  const tsFile = (content = TS): ProcessedFile =>
    ({ path: path.join(tmp, "tok.ts"), content, chunks: [] } as any);

  it("seeds definitions (countTerms, class, method); skips a private member", async () => {
    const g = (await service().seedGraph(tsFile()))!;
    expect(g).not.toBeNull();
    const names = g.entities.map((e) => e.name);
    expect(names).toContain("countTerms"); // the symbol all five models missed
    expect(names).toContain("helper"); // non-exported definition still seeded
    expect(names).toContain("Tokenizer"); // class
    expect(names).toContain("tokenize"); // method (definition kind → always)
    expect(names).not.toContain("secret"); // private property (member, not exported) → skipped
    expect(names).not.toContain("scratch"); // local variable → not a definition/exported member
  });

  it("every seeded type/predicate is in the closed Phase-2 vocabulary", async () => {
    const g = (await service().seedGraph(tsFile()))!;
    const types = new Set(allowedEntityTypes());
    const preds = new Set(allowedRelationTypes());
    for (const e of g.entities) expect(types.has(e.entityType)).toBe(true);
    for (const r of g.relations) for (const p of r.relationType) expect(preds.has(p)).toBe(true);
  });

  it("emits calls + imports edges (imports → depends_on on a dependency entity)", async () => {
    const g = (await service().seedGraph(tsFile()))!;
    expect(g.relations.some((r) => r.relationType.includes("calls"))).toBe(true);
    const dep = g.relations.find((r) => r.relationType.includes("depends_on"));
    expect(dep).toBeDefined();
    expect(g.entities.some((e) => e.name === dep!.to && e.entityType === "dependency")).toBe(true);
  });

  it("is a no-op on unchanged content: uses the cached table instead of re-parsing", async () => {
    const store = new AstSymbolStore(path.join(tmp, "c.json"), stubLogger());
    const content = "export function real() {}";
    // Pre-seed the cache with a SENTINEL the real parser would never produce.
    store.set(hashContent(content), {
      schemaVersion: 1,
      symbols: [{ name: "SENTINEL", qualifiedName: "SENTINEL", kind: "function", span: { startLine: 1, endLine: 1 }, exported: true }],
      references: [],
    });
    const svc = new AstSeedService(store, stubLogger(), tmp);
    const g = (await svc.seedGraph(tsFile(content)))!;
    expect(g.entities.map((e) => e.name)).toEqual(["SENTINEL"]); // cache hit, not re-parsed
  });

  it("returns null for a non-code file (no throw)", async () => {
    const txt: ProcessedFile = { path: path.join(tmp, "notes.txt"), content: "just prose", chunks: [] } as any;
    expect(await service().seedGraph(txt)).toBeNull();
  });
});

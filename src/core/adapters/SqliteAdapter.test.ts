import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import initSqlJs from "sql.js";
import { SqliteAdapter } from "./SqliteAdapter";
import { stubLogger } from "../../__tests__/helpers";
import { obsText } from "../../types";

const OPTS = { extensions: [".db", ".sqlite", ".sqlite3"], maxRowsPerTable: 5000, excludeTables: [] };

async function makeDbFile(dir: string, build: (db: any) => void, name = "data.db"): Promise<string> {
  const SQL = await initSqlJs({ locateFile: (f) => path.join(path.dirname(require.resolve("sql.js")), f) });
  const db = new SQL.Database();
  build(db);
  const buf = Buffer.from(db.export());
  db.close();
  const p = path.join(dir, name);
  fs.writeFileSync(p, buf);
  return p;
}

describe("SqliteAdapter", () => {
  const adapter = new SqliteAdapter(OPTS, stubLogger());
  let tmp: string;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "kgsqlite-"));
  });
  afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

  it("maps tables→types, rows→entities (PK identity), FK→edge, with stamped provenance", async () => {
    const dbPath = await makeDbFile(tmp, (db) => {
      db.run("CREATE TABLE authors(id INTEGER PRIMARY KEY, name TEXT, country TEXT)");
      db.run("CREATE TABLE books(id INTEGER PRIMARY KEY, title TEXT, author_id INTEGER REFERENCES authors(id))");
      db.run("INSERT INTO authors VALUES (1,'Borges','AR')");
      db.run("INSERT INTO books VALUES (10,'Ficciones',1)");
    });

    expect(adapter.canHandle(dbPath)).toBe(true);
    const g = (await adapter.extract(dbPath))!;

    // WS-30: identity is PK-based (table#pk), NOT the human label
    const borges = g.entities.find((e) => e.name === "authors#1");
    const book = g.entities.find((e) => e.name === "books#10");
    expect(borges?.entityType).toBe("authors"); // table → entityType
    expect(book?.entityType).toBe("books");

    // WS-30: the label column is surfaced as an observation/alias, not the identity
    expect(borges!.observations.some((o) => obsText(o) === "name: Borges")).toBe(true);
    expect(book!.observations.some((o) => obsText(o) === "title: Ficciones")).toBe(true);

    // non-FK column → provenance-stamped observation
    const countryObs = borges!.observations.find((o) => obsText(o).startsWith("country"));
    expect(countryObs).toMatchObject({ sourceAdapter: "sqlite", locator: "table:authors/row:1", source: dbPath });

    // FK → edge (book → author), predicate from the FK column minus _id
    const edge = g.relations.find((r) => r.from === "books#10" && r.to === "authors#1");
    expect(edge?.relationType).toEqual(["author"]);
    // the FK column itself is an edge, NOT a stray observation on the book
    expect(book!.observations.some((o) => obsText(o).startsWith("author_id"))).toBe(false);
  });

  it("names a row <table>#<pk> when no label column exists", async () => {
    const dbPath = await makeDbFile(tmp, (db) => {
      db.run("CREATE TABLE parts(id INTEGER PRIMARY KEY, qty INTEGER)");
      db.run("INSERT INTO parts VALUES (42, 7)");
    });
    const g = (await adapter.extract(dbPath))!;
    expect(g.entities[0].name).toBe("parts#42");
  });

  it("skips excluded tables", async () => {
    const a = new SqliteAdapter({ ...OPTS, excludeTables: ["secrets"] }, stubLogger());
    const dbPath = await makeDbFile(tmp, (db) => {
      db.run("CREATE TABLE secrets(id INTEGER PRIMARY KEY, token TEXT)");
      db.run("CREATE TABLE notes(id INTEGER PRIMARY KEY, name TEXT)");
      db.run("INSERT INTO secrets VALUES (1,'hunter2')");
      db.run("INSERT INTO notes VALUES (1,'hello')");
    });
    const g = (await a.extract(dbPath))!;
    expect(g.entities.some((e) => e.entityType === "secrets")).toBe(false);
    expect(g.entities.some((e) => e.entityType === "notes")).toBe(true);
  });

  it("canHandle rejects a .db file that is not actually SQLite (header sniff)", async () => {
    const fake = path.join(tmp, "notreally.db");
    fs.writeFileSync(fake, "this is plain text, not a database at all");
    expect(adapter.canHandle(fake)).toBe(false);
  });

  it("does not claim a non-.db extension", () => {
    expect(adapter.canHandle("/x/notes.md")).toBe(false);
  });

  it("returns null for a SQLite db with no user tables", async () => {
    // create+drop initializes the file (header written) while leaving no user tables.
    const dbPath = await makeDbFile(tmp, (db) => db.run("CREATE TABLE t(x); DROP TABLE t;"));
    expect(adapter.canHandle(dbPath)).toBe(true); // valid SQLite header
    expect(await adapter.extract(dbPath)).toBeNull(); // ...but nothing to emit
  });

  // ── WS-08: composite-PK rows stay distinct (tuple identity, not first-pk-only) ──
  it("keeps composite-PK rows distinct (identity + locator use the joined tuple)", async () => {
    const dbPath = await makeDbFile(tmp, (db) => {
      db.run("CREATE TABLE events(year INTEGER, month INTEGER, data TEXT, PRIMARY KEY (year, month))");
      db.run("INSERT INTO events VALUES (2025, 1, 'jan')");
      db.run("INSERT INTO events VALUES (2025, 2, 'feb')");
    });
    const g = (await adapter.extract(dbPath))!;
    const events = g.entities.filter((e) => e.entityType === "events");
    // first-pk-only would collapse both (year=2025) into one entity; the tuple keeps them distinct
    expect(events.map((e) => e.name).sort()).toEqual(["events#2025|1", "events#2025|2"]);
    const jan = events.find((e) => e.name === "events#2025|1")!;
    const dataObs = jan.observations.find((o) => obsText(o).startsWith("data"));
    expect(dataObs).toMatchObject({ locator: "table:events/row:2025|1" });
  });

  // ── WS-06 + WS-08: a composite FK becomes ONE edge to the matching parent tuple ──
  it("emits one edge per composite FK, resolved against the full parent tuple", async () => {
    const dbPath = await makeDbFile(tmp, (db) => {
      db.run("CREATE TABLE teams(org INTEGER, num INTEGER, name TEXT, PRIMARY KEY (org, num))");
      db.run(
        "CREATE TABLE members(id INTEGER PRIMARY KEY, team_org INTEGER, team_num INTEGER, " +
          "FOREIGN KEY (team_org, team_num) REFERENCES teams(org, num))"
      );
      db.run("INSERT INTO teams VALUES (1, 10, 'Alpha')");
      db.run("INSERT INTO teams VALUES (1, 20, 'Beta')");
      db.run("INSERT INTO members VALUES (100, 1, 20)");
    });
    const g = (await adapter.extract(dbPath))!;
    // exactly one edge (member → Beta team), NOT two single-column edges
    const edges = g.relations.filter((r) => r.from === "members#100");
    expect(edges).toHaveLength(1);
    expect(edges[0].to).toBe("teams#1|20"); // resolves to the (1,20) tuple, not (1,10)
  });

  // ── WS-07: implicit-PK FK shorthand resolves to the parent's PK column ──
  it("resolves an implicit-PK FK shorthand to the parent primary key (edge not dropped)", async () => {
    const dbPath = await makeDbFile(tmp, (db) => {
      db.run("CREATE TABLE authors(id INTEGER PRIMARY KEY, name TEXT)");
      // `REFERENCES authors` with no parent column → PRAGMA returns to=NULL
      db.run("CREATE TABLE books(id INTEGER PRIMARY KEY, author INTEGER REFERENCES authors)");
      db.run("INSERT INTO authors VALUES (7, 'Le Guin')");
      db.run("INSERT INTO books VALUES (70, 7)");
    });
    const g = (await adapter.extract(dbPath))!;
    const edge = g.relations.find((r) => r.from === "books#70" && r.to === "authors#7");
    expect(edge).toBeDefined(); // previously silently dropped (lookup against `authors␟null`)
    expect(edge!.relationType).toEqual(["author"]);
  });

  // ── WS-30: a non-unique label column never fuses distinct rows ──
  it("keeps rows with a duplicate label distinct (PK identity), label surfaced as observation", async () => {
    const dbPath = await makeDbFile(tmp, (db) => {
      db.run("CREATE TABLE products(id INTEGER PRIMARY KEY, name TEXT)");
      db.run("INSERT INTO products VALUES (1, 'Widget')");
      db.run("INSERT INTO products VALUES (2, 'Widget')"); // duplicate non-unique name
    });
    const g = (await adapter.extract(dbPath))!;
    const products = g.entities.filter((e) => e.entityType === "products");
    expect(products.map((e) => e.name).sort()).toEqual(["products#1", "products#2"]);
    for (const p of products) {
      expect(p.observations.some((o) => obsText(o) === "name: Widget")).toBe(true);
    }
  });

  // ── WS-57: no-PK table identity tracks rowid, not the result-set positional index ──
  it("keys no-PK rows on rowid (stable under delete+reinsert, not positional drift)", async () => {
    // beta keeps rowid=2 even after row 1 is deleted and a new row is inserted (rowid=3);
    // the old positional fallback (String(i)) would re-label beta as index 0 after the delete.
    const dbPath = await makeDbFile(tmp, (db) => {
      db.run("CREATE TABLE logs(ts TEXT, message TEXT)"); // no PRIMARY KEY → rowid table
      db.run("INSERT INTO logs VALUES ('2025-01-01', 'alpha')"); // rowid 1
      db.run("INSERT INTO logs VALUES ('2025-01-02', 'beta')"); // rowid 2
      db.run("DELETE FROM logs WHERE message = 'alpha'"); // beta now the FIRST result row
      db.run("INSERT INTO logs VALUES ('2025-01-03', 'gamma')"); // rowid 3
    });
    const g = (await adapter.extract(dbPath))!;
    const beta = g.entities.find((e) => e.observations.some((o) => obsText(o) === "message: beta"))!;
    const gamma = g.entities.find((e) => e.observations.some((o) => obsText(o) === "message: gamma"))!;
    // beta is the first result row but keeps rowid 2 (positional index would give it 0/1)
    expect(beta.name).toBe("logs#2");
    expect(gamma.name).toBe("logs#3");
    expect(beta.observations.some((o) => (o as any).locator === "table:logs/row:2")).toBe(true);
  });

  // ── WS-58: cellObservation consults the declared column type ──
  it("renders BOOLEAN as true/false and normalizes DATE to ISO-8601", async () => {
    const dbPath = await makeDbFile(tmp, (db) => {
      db.run("CREATE TABLE settings(id INTEGER PRIMARY KEY, enabled BOOLEAN, created_at DATE)");
      db.run("INSERT INTO settings VALUES (1, 1, '2025-06-24')");
      db.run("INSERT INTO settings VALUES (2, 0, '2025-06-24')");
    });
    const g = (await adapter.extract(dbPath))!;
    const on = g.entities.find((e) => e.name === "settings#1")!;
    const off = g.entities.find((e) => e.name === "settings#2")!;
    expect(on.observations.some((o) => obsText(o) === "enabled: true")).toBe(true);
    expect(off.observations.some((o) => obsText(o) === "enabled: false")).toBe(true);
    expect(on.observations.some((o) => obsText(o) === "created_at: 2025-06-24T00:00:00.000Z")).toBe(true);
  });
});

import * as fs from "fs";
import * as path from "path";
import initSqlJs, { Database, SqlJsStatic } from "sql.js";
import { IStructuredAdapter } from "./IStructuredAdapter";
import { KnowledgeGraph, Entity, Relation, Observation } from "../../types";
import { Logger } from "../../shared";

/**
 * SQLite structured-emit adapter (data-sink track, Class A). A `.db` is a property
 * graph in disguise: this maps it DIRECTLY to graph fragments — **no LLM, no
 * hallucination** — tables → entity types, rows → entities, foreign keys → edges.
 * The fragment still flows through merge/canon, so a SQLite `Author` reconciles
 * with a prose-extracted `author`. Every fact is stamped `sourceAdapter:"sqlite"`
 * + `locator:"table:<t>/row:<pk>"` (ECS source-tagging).
 *
 * Uses `sql.js` (WASM) — zero native build, runs on the Node-18 baseline. The
 * `IStructuredAdapter` boundary makes a later swap to the built-in `node:sqlite`
 * (once it stabilizes) a one-file change. Read-only introspection; the whole file
 * is loaded into memory (a sql.js trait) — fine for a batch tool, bounded on output
 * by `maxRowsPerTable`.
 */
export interface SqliteAdapterOptions {
  extensions: string[];
  maxRowsPerTable: number;
  excludeTables: string[];
}

interface ColInfo {
  name: string;
  type: string;
  pk: boolean;
}
interface FkInfo {
  id: number; // PRAGMA foreign_key_list `id` — composite-FK group key
  from: string; // child column
  table: string; // parent table
  to: string; // parent column referenced
}

/** A composite (or single-column) foreign key: all child→parent column pairs sharing one `id`. */
interface FkGroup {
  id: number;
  table: string; // parent table
  parts: { from: string; to: string }[];
}

const SQLITE_MAGIC = "SQLite format 3"; // 16-byte magic
const LABEL_COLS = ["name", "title", "label", "slug"];

let sqlJsPromise: Promise<SqlJsStatic> | undefined;
function getSqlJs(): Promise<SqlJsStatic> {
  if (!sqlJsPromise) {
    // sql-wasm.wasm ships beside the resolved dist entry — point sql.js at it.
    const dist = path.dirname(require.resolve("sql.js"));
    sqlJsPromise = initSqlJs({ locateFile: (f) => path.join(dist, f) });
  }
  return sqlJsPromise;
}

export class SqliteAdapter implements IStructuredAdapter {
  readonly id = "sqlite";

  constructor(private readonly opts: SqliteAdapterOptions, private readonly logger: Logger) {}

  canHandle(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase();
    if (!this.opts.extensions.map((e) => e.toLowerCase()).includes(ext)) return false;
    return this.hasSqliteHeader(filePath); // a non-sqlite `.db` falls through to the normal path
  }

  private hasSqliteHeader(filePath: string): boolean {
    try {
      const fd = fs.openSync(filePath, "r");
      try {
        const buf = Buffer.alloc(16);
        fs.readSync(fd, buf, 0, 16, 0);
        return buf.toString("latin1", 0, 15) === SQLITE_MAGIC;
      } finally {
        fs.closeSync(fd);
      }
    } catch {
      return false;
    }
  }

  async extract(filePath: string): Promise<KnowledgeGraph | null> {
    const SQL = await getSqlJs();
    let db: Database;
    try {
      db = new SQL.Database(new Uint8Array(fs.readFileSync(filePath)));
    } catch (err) {
      this.logger.warn(`SQLite adapter could not open ${filePath} (${err}); skipping.`);
      return null;
    }
    try {
      return this.mapDatabase(db, filePath);
    } finally {
      db.close();
    }
  }

  private mapDatabase(db: Database, filePath: string): KnowledgeGraph | null {
    const tables = this.userTables(db).filter((t) => !this.opts.excludeTables.includes(t));
    if (tables.length === 0) return null;

    // Schema per table: columns, the (possibly composite) PK columns, whether the table is
    // WITHOUT ROWID, and the FK groups (one per composite-FK `id`, with null `to` resolved).
    const schema = new Map<
      string,
      { cols: ColInfo[]; pks: string[]; withoutRowid: boolean; fkGroups: FkGroup[] }
    >();
    for (const t of tables) {
      const cols = this.tableInfo(db, t);
      schema.set(t, {
        cols,
        pks: cols.filter((c) => c.pk).map((c) => c.name),
        withoutRowid: this.isWithoutRowid(db, t),
        fkGroups: [], // filled below, once every table's PK is known (for implicit-PK FKs)
      });
    }
    // Resolve FK groups (WS-06 grouping by `id`; WS-07 null `to` → parent PK columns).
    for (const t of tables) {
      const parentPk = (parent: string): string[] => schema.get(parent)?.pks ?? [];
      schema.get(t)!.fkGroups = this.fkGroups(db, t, parentPk);
    }

    // Which parent (table, column-set) tuples are referenced as FK targets (so we index them).
    // Map<parentTable, Set<canonical sorted column list>>.
    const referencedTuples = new Map<string, Set<string>>();
    for (const { fkGroups } of schema.values()) {
      for (const g of fkGroups) {
        const cols = g.parts.map((p) => p.to).sort();
        if (!referencedTuples.has(g.table)) referencedTuples.set(g.table, new Set());
        referencedTuples.get(g.table)!.add(cols.join("␟"));
      }
    }

    const entities: Entity[] = [];
    const relations: Relation[] = [];
    // `${table}␟${sortedCols}` → (canonical tuple value → entity name), for FK resolution in pass 2.
    const index = new Map<string, Map<string, string>>();
    // Cache the (possibly capped) rows + their computed entity names per table for pass 2.
    const rowsByTable = new Map<string, { rows: Record<string, unknown>[]; names: string[] }>();

    // ── pass 1: rows → entities (+ observations), build the FK-target index ──
    for (const t of tables) {
      const { cols, pks, fkGroups } = schema.get(t)!;
      const fkFrom = new Set(fkGroups.flatMap((g) => g.parts.map((p) => p.from)));
      const labelCol = this.pickLabelCol(cols);
      const rows = this.selectRows(db, t);
      const names: string[] = [];
      const tupleSets = referencedTuples.get(t) ?? new Set<string>();

      rows.forEach((row) => {
        const pkVal = this.rowPkValue(t, row, pks, schema.get(t)!.withoutRowid);
        // WS-30: identity is ALWAYS PK-based (table#pk); a non-unique label can't fuse rows.
        const name = `${t}#${pkVal}`;
        names.push(name);

        const observations: Observation[] = [];
        // WS-30: surface the human label (if any) as an alias observation, not the identity.
        if (labelCol) {
          const labelText = this.cellObservation(labelCol, row[labelCol], this.colType(cols, labelCol));
          if (labelText) observations.push(this.stampObs(labelText, t, pkVal, filePath));
        }
        for (const c of cols) {
          if (c.name === labelCol) continue; // already surfaced as the alias observation
          if (fkFrom.has(c.name)) continue; // FK columns become edges, not observations
          const text = this.cellObservation(c.name, row[c.name], c.type);
          if (text) observations.push(this.stampObs(text, t, pkVal, filePath));
        }
        entities.push({ name, entityType: t, files: [filePath], observations });

        // Index every referenced parent-column tuple so child FKs can resolve to this row.
        for (const tupleKey of tupleSets) {
          const refCols = tupleKey.split("␟");
          if (refCols.some((col) => row[col] == null)) continue;
          const valueKey = refCols.map((col) => String(row[col])).join("␟");
          const key = `${t}␟${tupleKey}`;
          if (!index.has(key)) index.set(key, new Map());
          index.get(key)!.set(valueKey, name);
        }
      });
      rowsByTable.set(t, { rows, names });
    }

    // ── pass 2: foreign keys → edges (child row → referenced parent row) ──
    // WS-06: one edge per composite FK group, only when ALL parts resolve to the same parent tuple.
    for (const t of tables) {
      const { fkGroups } = schema.get(t)!;
      if (fkGroups.length === 0) continue;
      const { rows, names } = rowsByTable.get(t)!;
      rows.forEach((row, i) => {
        for (const g of fkGroups) {
          if (g.parts.some((p) => row[p.from] == null)) continue; // partial FK → no edge
          const refCols = g.parts.map((p) => p.to).sort();
          const valueKey = refCols
            .map((col) => {
              const part = g.parts.find((p) => p.to === col)!;
              return String(row[part.from]);
            })
            .join("␟");
          const parent = index.get(`${g.table}␟${refCols.join("␟")}`)?.get(valueKey);
          if (!parent) continue; // target row not emitted (capped / missing) → no dangling edge
          relations.push({ from: names[i], to: parent, relationType: [this.fkPredicate(g)] });
        }
      });
    }

    return { entities, relations };
  }

  /** Provenance-stamped observation for a cell value. */
  private stampObs(text: string, table: string, pkVal: string, filePath: string): Observation {
    return { text, sourceAdapter: this.id, locator: `table:${table}/row:${pkVal}`, source: filePath };
  }

  private colType(cols: ColInfo[], name: string): string {
    return cols.find((c) => c.name === name)?.type ?? "";
  }

  /**
   * Stable per-row identity (WS-08 composite PK · WS-57 no-PK rowid):
   * - declared PK(s) present → the joined tuple (composite-safe);
   * - no PK on a rowid table → the injected `__rowid__` (stable across re-ingest/reorder);
   * - no PK on a WITHOUT ROWID table → fall back to all columns joined (no rowid available).
   */
  private rowPkValue(table: string, row: Record<string, unknown>, pks: string[], withoutRowid: boolean): string {
    if (pks.length > 0 && pks.every((col) => row[col] != null)) {
      return pks.map((col) => String(row[col])).join("|");
    }
    if (!withoutRowid && row.__rowid__ != null) return String(row.__rowid__);
    // WITHOUT ROWID table with no usable PK: derive a deterministic key from the full row.
    return Object.keys(row)
      .filter((k) => k !== "__rowid__")
      .sort()
      .map((k) => String(row[k]))
      .join("|");
  }

  // ── sql.js helpers ──────────────────────────────────────────────────────────

  /** First result set's single column as a string[] (empty when no rows). */
  private queryColumn(db: Database, sql: string): string[] {
    const res = db.exec(sql);
    return res.length ? res[0].values.map((r) => String(r[0])) : [];
  }

  /** First result set as an array of column→value row objects. */
  private queryRows(db: Database, sql: string): Record<string, unknown>[] {
    const res = db.exec(sql);
    if (!res.length) return [];
    const { columns, values } = res[0];
    return values.map((row) => Object.fromEntries(columns.map((c, i) => [c, row[i]])));
  }

  private userTables(db: Database): string[] {
    return this.queryColumn(
      db,
      `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`
    );
  }

  private tableInfo(db: Database, table: string): ColInfo[] {
    return this.queryRows(db, `PRAGMA table_info("${table.replace(/"/g, '""')}")`).map((r) => ({
      name: String(r.name),
      type: String(r.type ?? ""),
      pk: Number(r.pk) > 0,
    }));
  }

  /** Raw FK rows from PRAGMA, carrying the `id` composite-FK group key. */
  private fkList(db: Database, table: string): FkInfo[] {
    return this.queryRows(db, `PRAGMA foreign_key_list("${table.replace(/"/g, '""')}")`).map((r) => ({
      id: Number(r.id),
      from: String(r.from),
      table: String(r.table),
      to: r.to == null ? "" : String(r.to),
    }));
  }

  /**
   * FK rows grouped by `id` into composite-FK groups (WS-06). For each group, an implicit-PK
   * shorthand (`REFERENCES parent` with no column, `to` empty) resolves to the parent table's
   * PK column(s) positionally (WS-07); groups whose `to` can't be resolved are dropped.
   */
  private fkGroups(db: Database, table: string, parentPk: (parent: string) => string[]): FkGroup[] {
    const byId = new Map<number, FkInfo[]>();
    for (const fk of this.fkList(db, table)) {
      if (!byId.has(fk.id)) byId.set(fk.id, []);
      byId.get(fk.id)!.push(fk);
    }
    const groups: FkGroup[] = [];
    for (const [id, rows] of byId) {
      const parent = rows[0].table;
      const missingTo = rows.filter((r) => !r.to);
      let parts: { from: string; to: string }[];
      if (missingTo.length === 0) {
        parts = rows.map((r) => ({ from: r.from, to: r.to }));
      } else {
        // Implicit-PK shorthand: map child columns onto the parent's PK columns in order.
        const pkCols = parentPk(parent);
        if (pkCols.length !== rows.length) continue; // can't resolve — drop rather than fabricate
        parts = rows.map((r, i) => ({ from: r.from, to: r.to || pkCols[i] }));
      }
      if (parts.some((p) => !p.to)) continue; // unresolved target → drop the edge
      groups.push({ id, table: parent, parts });
    }
    return groups;
  }

  /** True when the table is declared WITHOUT ROWID (no implicit rowid to use as a stable key). */
  private isWithoutRowid(db: Database, table: string): boolean {
    const sql = this.queryColumn(
      db,
      `SELECT sql FROM sqlite_master WHERE type='table' AND name='${table.replace(/'/g, "''")}'`
    );
    return /\bwithout\s+rowid\b/i.test(sql[0] ?? "");
  }

  private selectRows(db: Database, table: string): Record<string, unknown>[] {
    const cap = this.opts.maxRowsPerTable;
    const q = (cols: string) =>
      this.queryRows(db, `SELECT ${cols} FROM "${table.replace(/"/g, '""')}" LIMIT ${cap + 1}`);
    // WS-57: project the implicit rowid (as __rowid__) so no-PK rows get a stable identity.
    // WITHOUT ROWID tables have no rowid — fall back to a plain SELECT *.
    let rows: Record<string, unknown>[];
    try {
      rows = this.isWithoutRowid(db, table) ? q("*") : q("*, rowid AS __rowid__");
    } catch {
      rows = q("*"); // defensive: any rowid-projection failure degrades to plain select
    }
    if (rows.length > cap) {
      this.logger.warn(
        `SQLite adapter: table '${table}' exceeds maxRowsPerTable=${cap}; emitting the first ${cap} rows (raise adapters.sqlite.maxRowsPerTable to include more).`
      );
      return rows.slice(0, cap);
    }
    return rows;
  }

  // ── mapping helpers ───────────────────────────────────────────────────────

  private pickLabelCol(cols: ColInfo[]): string | null {
    for (const want of LABEL_COLS) {
      const hit = cols.find((c) => c.name.toLowerCase() === want);
      if (hit) return hit.name;
    }
    return null;
  }

  /**
   * Render a non-FK cell as an observation; skip nulls/empties/blobs.
   * WS-58: consult the declared column type — render BOOLEAN as true/false and
   * normalize DATE/DATETIME/TIMESTAMP to ISO-8601 where the value is unambiguous.
   */
  private cellObservation(col: string, value: unknown, type = ""): string | null {
    if (value === null || value === undefined) return null;
    if (value instanceof Uint8Array) return null; // BLOB — skip
    const rendered = this.renderTyped(value, type);
    const s = rendered.trim();
    return s ? `${col}: ${s}` : null;
  }

  private renderTyped(value: unknown, type: string): string {
    const t = type.toUpperCase();
    if (/\bBOOL/.test(t)) {
      // SQLite stores booleans as 0/1; render canonically. Non-0/1 values pass through.
      if (value === 0 || value === "0") return "false";
      if (value === 1 || value === "1") return "true";
    }
    if (/\b(DATE|DATETIME|TIMESTAMP)\b/.test(t)) {
      const iso = this.toIsoDate(value);
      if (iso) return iso;
    }
    return String(value);
  }

  /** Best-effort ISO-8601 normalization; returns null when the value isn't a parseable date. */
  private toIsoDate(value: unknown): string | null {
    if (typeof value === "number") {
      // Unix epoch seconds (SQLite DATE/strftime convention); ms heuristic for large values.
      const ms = value > 1e12 ? value : value * 1000;
      const d = new Date(ms);
      return isNaN(d.getTime()) ? null : d.toISOString();
    }
    if (typeof value === "string") {
      const s = value.trim();
      if (!s) return null;
      // Pure date (YYYY-MM-DD) → midnight UTC; otherwise let Date parse it.
      const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s}T00:00:00Z` : s);
      return isNaN(d.getTime()) ? null : d.toISOString();
    }
    return null;
  }

  /** Predicate for a FK edge: the child column minus a trailing id suffix, else the parent table. */
  private fkPredicate(g: FkGroup): string {
    // Single-column FK → derive from the child column; composite → use the parent table name.
    const base = g.parts.length === 1 ? g.parts[0].from : g.table;
    const stripped = base.replace(/[_-]?id$/i, "").trim();
    return (stripped || g.table).toLowerCase();
  }
}

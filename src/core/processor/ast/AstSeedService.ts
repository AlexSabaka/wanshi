import * as path from "path";
import { default as DocumentOutline } from "@wanshi-kg/outlion";
import { Logger } from "../../../shared";
import { Entity, KnowledgeGraph, Observation, ProcessedFile, Relation } from "../../../types";
import { AstSymbolStore } from "./AstSymbolStore";
import {
  MODULE_MARKER,
  REFERENCE_KIND_TO_PREDICATE,
  SYMBOL_KIND_TO_ENTITY_TYPE,
  SymbolTable,
  hashContent,
  shouldSeedSymbol,
} from "../../../shared/utils/astSymbols";

/**
 * Deterministic AST symbol seed (Phase 8): walks a file's Tree-sitter symbol table
 * (via the pinned `document-outline-gen`) into a `KnowledgeGraph` of definition/
 * exported-member entities + `calls`/`imports` edges, **before** the LLM. The merger
 * unions it with the LLM's per-chunk graphs, so the model *augments* the symbol set
 * (adds descriptions/relations) rather than originating it — closing the recall gap
 * where exported symbols like `countTerms` were missed entirely. Network-free; all
 * seeded types/predicates are existing Phase-2 vocabulary; results are content-hash
 * cached so an unchanged file is a no-op.
 */
export class AstSeedService {
  private readonly generator = new DocumentOutline();

  constructor(
    private readonly store: AstSymbolStore,
    private readonly logger: Logger,
    private readonly inputRoot: string = ""
  ) {}

  /** Load the content-hash cache once, before the file loop. */
  async loadCache(): Promise<void> {
    await this.store.load();
  }

  /** Persist any newly-extracted tables after the file loop. */
  async saveCache(): Promise<void> {
    await this.store.save();
  }

  /** Seed graph for one file, or null for non-code / no symbols (nothing to append). */
  async seedGraph(processedFile: ProcessedFile): Promise<KnowledgeGraph | null> {
    const content = processedFile.content;
    if (!content) return null;
    const ext = path.extname(processedFile.path).replace(/^\./, "");
    if (!ext) return null;

    // Key the cache by content AND extension: byte-identical files of different
    // extensions parse under different grammars, so a content-only key would let
    // a `.js` lookup reuse a `.ts` parse (or vice versa). Mixing `ext` in keeps
    // them distinct without changing the (unchanged-file) no-op path.
    const cacheKey = hashContent(ext + "::" + content);
    let table = this.store.get(cacheKey);
    if (!table) {
      // Skip extensions outlion has no grammar for — extractSymbolsSafe would
      // return a truthy *empty* table that, if cached, would suppress this file's
      // symbols on every later run (the cache-the-failure trap).
      if (!this.generator.isSupported(ext)) return null;
      table = await this.generator.extractSymbolsSafe(content, ext);
      // extractSymbolsSafe never throws; on parse failure it returns an empty
      // table. Only persist a *non-empty* extraction so a transient failure
      // isn't permanently cached as "this file has no symbols".
      if (table.symbols.length > 0) this.store.set(cacheKey, table);
    }
    if (!table.symbols.length) return null;

    return this.toGraph(table, processedFile.path);
  }

  private toGraph(table: SymbolTable, filePath: string): KnowledgeGraph | null {
    const createdAt = new Date().toISOString();
    const entities: Entity[] = [];
    const qualifiedToName = new Map<string, string>();

    // WS-24: stamp the same ECS provenance the sibling deterministic seeds
    // (EXIF/C2PA/sqlite) carry — `sourceAdapter:"ast"` always, and an `L<line>`
    // locator for symbol facts that have a source span.
    const obs = (text: string, locator?: string): Observation => ({
      text,
      source: filePath,
      sourceAdapter: "ast",
      locator,
      createdAt,
    });

    for (const sym of table.symbols) {
      if (!shouldSeedSymbol(sym)) continue;
      // Last writer wins on a qualifiedName clash — harmless (same simple name).
      qualifiedToName.set(sym.qualifiedName, sym.name);
      entities.push({
        name: sym.name,
        entityType: SYMBOL_KIND_TO_ENTITY_TYPE[sym.kind],
        files: [filePath],
        observations: [
          obs(
            `${sym.kind} ${sym.qualifiedName}${sym.signature ?? ""}${sym.exported ? " (exported)" : ""}`,
            `L${sym.span.startLine}`
          ),
        ],
      });
    }
    if (entities.length === 0) return null;

    // The file's own module node — created lazily, only when an edge needs it.
    const moduleName = this.relPath(filePath);
    let moduleAdded = false;
    const ensureModule = (): string => {
      if (!moduleAdded) {
        entities.push({
          name: moduleName,
          entityType: "module",
          files: [filePath],
          observations: [obs(`module ${moduleName}`)],
        });
        moduleAdded = true;
      }
      return moduleName;
    };
    const deps = new Set<string>();
    const ensureDep = (spec: string): void => {
      if (!deps.has(spec)) {
        entities.push({ name: spec, entityType: "dependency", files: [filePath], observations: [] });
        deps.add(spec);
      }
    };
    const resolve = (ref: string): string =>
      ref === MODULE_MARKER ? ensureModule() : qualifiedToName.get(ref) ?? ref;

    const relations: Relation[] = [];
    const seen = new Set<string>();
    const pushRel = (from: string, to: string, predicate: string) => {
      if (!from || !to || from === to) return;
      const key = `${from} ${to} ${predicate}`;
      if (seen.has(key)) return;
      seen.add(key);
      relations.push({ from, to, relationType: [predicate] });
    };

    for (const ref of table.references) {
      const predicate = REFERENCE_KIND_TO_PREDICATE[ref.kind];
      if (ref.kind === "imports") {
        ensureDep(ref.to);
        pushRel(ensureModule(), ref.to, predicate);
      } else {
        pushRel(resolve(ref.from), resolve(ref.to), predicate);
      }
    }

    return { entities, relations };
  }

  /** File path relative to the discovery root, posix-normalized; falls back to the raw path. */
  private relPath(filePath: string): string {
    if (!this.inputRoot) return filePath;
    const rel = path.relative(this.inputRoot, filePath);
    if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) return filePath;
    return rel.split(path.sep).join("/");
  }
}

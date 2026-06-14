import * as fs from "fs";
import * as path from "path";
import { KnowledgeGraph } from "../../../../types";
import { Logger } from "../../../../shared";

/**
 * One fetch outcome for a URL: whether it resolved (fetched + extracted) or was
 * blocked/gated, plus the graph that page contributed (entities/observations +
 * the `references` edge). Stored so a re-run NEVER refetches — the cached graph
 * is reused directly (cross-run + in-run dedup), regardless of --resume.
 */
export interface FetchCacheRecord {
  url: string;
  resolved: boolean;
  reason?: string; // why it was blocked (allowlist/robots/timeout/size/type/relevance)
  status?: number;
  contentType?: string;
  fetchedAt: string; // ISO-8601 (transaction time)
  graph?: KnowledgeGraph; // contribution to merge (present when resolved)
}

/**
 * Append-only JSONL sidecar for the gated web fetcher — the "never refetch"
 * guard. Mirrors `CheckpointService`: tolerant load (drops a truncated final
 * line), parent-dir ensured on first append, in-memory index keyed by URL.
 */
export class FetchCacheService {
  private readonly path: string;
  private readonly logger: Logger;
  private records: Map<string, FetchCacheRecord> = new Map();
  private loaded = false;
  private dirEnsured = false;

  constructor(cachePath: string, logger: Logger) {
    this.path = cachePath;
    this.logger = logger;
  }

  getPath(): string {
    return this.path;
  }

  /** Load any existing cache. Tolerant of a truncated final line. */
  async load(): Promise<number> {
    if (this.loaded) return this.records.size;
    this.loaded = true;

    if (!fs.existsSync(this.path)) return 0;

    const content = await fs.promises.readFile(this.path, "utf-8");
    let loaded = 0;
    let skipped = 0;
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const record = JSON.parse(trimmed) as FetchCacheRecord;
        if (record.url) {
          this.records.set(record.url, record);
          loaded++;
        }
      } catch {
        skipped++; // truncated/corrupt line — drop it, it'll be regenerated
      }
    }
    this.logger.info(
      `Loaded ${loaded} cached web fetch(es) from ${this.path}` +
        (skipped ? ` (skipped ${skipped} corrupt line(s))` : "")
    );
    return loaded;
  }

  has(url: string): boolean {
    return this.records.has(url);
  }

  get(url: string): FetchCacheRecord | undefined {
    return this.records.get(url);
  }

  /** Persist a fetch outcome and keep the in-memory index in sync. */
  async append(record: FetchCacheRecord): Promise<void> {
    this.records.set(record.url, record);
    if (!this.dirEnsured) {
      await fs.promises.mkdir(path.dirname(this.path), { recursive: true });
      this.dirEnsured = true;
    }
    await fs.promises.appendFile(this.path, JSON.stringify(record) + "\n");
  }
}

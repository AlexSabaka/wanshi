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
  /**
   * WS-03 — this is a TRANSIENT failure (timeout / 5xx / 429 / network), not a
   * deterministic negative. A transient record expires after `transientTtlMs`
   * (see `get`) so a one-off outage can't permanently poison a URL's resolution;
   * deterministic negatives (not-allowlisted / robots / too-large / wrong-type)
   * and successful fetches are cached indefinitely (transient absent/false).
   */
  transient?: boolean;
  /** TTL (ms) for a transient record; honored by `get`. */
  transientTtlMs?: number;
  /**
   * WS-04 — for the citation span-fetch path: the URL-scoped fetched CONTENT
   * (the cited work's body chunks + extracted graphs), cached so a re-fetch is
   * never needed, but WITHOUT a per-(doc,claim) faithfulness verdict baked in.
   * The verdict is claim-specific, so span-select + judge are recomputed per
   * citing doc on every call (a work cited by two docs gets two verdicts).
   */
  citationContent?: { chunks: string[]; graphs: KnowledgeGraph[]; resolved: boolean };
}

/** Default transient-failure TTL: a transient cache entry is ignored after this
 * window so the URL is retried on a later run (but not re-hammered within one). */
export const DEFAULT_TRANSIENT_TTL_MS = 6 * 60 * 60 * 1000; // 6h

/**
 * WS-03 — classify a failed fetch by its `reason`: is it a TRANSIENT outage
 * (timeout / network / 5xx / 429 / per-run budget) that should NOT permanently
 * poison the cache, or a DETERMINISTIC negative (not-allowlisted, robots,
 * too-large, wrong content-type, irrelevant) that's stable across runs?
 * Conservatively defaults UNKNOWN reasons to transient (safer to retry than to
 * permanently cache a maybe-transient failure).
 */
export function isTransientFetchReason(reason: string | undefined): boolean {
  if (!reason) return true; // no reason on a failure ⇒ treat as transient (retry)
  const r = reason.toLowerCase();
  // Deterministic negatives — stable across runs, cache permanently.
  if (
    r === "not-allowlisted" ||
    r === "robots-disallow" ||
    r === "too-large" ||
    r === "irrelevant" ||
    r.startsWith("content-type:")
  ) {
    return false;
  }
  // 4xx (except 429) is a deterministic client error; 429 + 5xx are transient.
  const httpMatch = /^http-(\d{3})$/.exec(r);
  if (httpMatch) {
    const code = Number(httpMatch[1]);
    if (code === 429 || code >= 500) return true;
    return false; // other 4xx → deterministic
  }
  // timeout / fetch-error / redirect-block / budget-exceeded / unknown → transient.
  return true;
}

/**
 * Append-only JSONL sidecar for the gated web fetcher — the "never refetch"
 * guard. Mirrors `CheckpointService`: tolerant load (drops a truncated final
 * line), parent-dir ensured on first append, in-memory index keyed by URL.
 */
export class FetchCacheService {
  private readonly path: string;
  private readonly logger: Logger;
  private readonly now: () => number;
  private records: Map<string, FetchCacheRecord> = new Map();
  private loaded = false;
  private dirEnsured = false;

  /** `now` is injectable so the transient-TTL expiry is unit-testable. */
  constructor(cachePath: string, logger: Logger, now: () => number = Date.now) {
    this.path = cachePath;
    this.logger = logger;
    this.now = now;
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
    return this.get(url) !== undefined;
  }

  get(url: string): FetchCacheRecord | undefined {
    const record = this.records.get(url);
    if (!record) return undefined;
    // WS-03: an expired transient failure is treated as a cache miss so the URL
    // is retried, instead of permanently poisoning resolution off one outage.
    if (this.isExpiredTransient(record)) return undefined;
    return record;
  }

  private isExpiredTransient(record: FetchCacheRecord): boolean {
    if (!record.transient) return false;
    const ttl = record.transientTtlMs ?? DEFAULT_TRANSIENT_TTL_MS;
    const fetchedMs = Date.parse(record.fetchedAt);
    if (Number.isNaN(fetchedMs)) return true; // unparseable timestamp ⇒ don't trust it
    return this.now() > fetchedMs + ttl;
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

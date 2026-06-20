import * as fs from 'fs';
import * as path from 'path';
import { Logger } from '../../shared';
import { MineArticleResult } from './types';

/**
 * One checkpointed MINE article: the per-article result, keyed by a signature that
 * folds in the run config (model + judge + arm). Re-running the SAME config resumes
 * after a crash; changing the config (model/prompt/glossary/open-predicate) changes
 * the key, so stale results are never reused.
 */
export interface MineCheckpointRecord {
  key: string;
  result: MineArticleResult;
}

/**
 * Append-only JSONL sidecar so a crash mid-sweep doesn't lose completed articles
 * (the overnight run was wiped by an OS reboot). Mirrors FetchCacheService /
 * CheckpointService: tolerant load (drops a truncated final line), parent-dir
 * ensured on first append, in-memory index keyed by the run+article signature.
 */
export class MineCheckpoint {
  private readonly path: string;
  private readonly logger: Logger;
  private records: Map<string, MineArticleResult> = new Map();
  private loaded = false;
  private dirEnsured = false;

  constructor(checkpointPath: string, logger: Logger) {
    this.path = checkpointPath;
    this.logger = logger;
  }

  /** Load any existing checkpoint. Tolerant of a truncated final line. */
  async load(): Promise<number> {
    if (this.loaded) return this.records.size;
    this.loaded = true;
    if (!fs.existsSync(this.path)) return 0;

    const content = await fs.promises.readFile(this.path, 'utf-8');
    let loaded = 0;
    let skipped = 0;
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const record = JSON.parse(trimmed) as MineCheckpointRecord;
        if (record.key && record.result) {
          this.records.set(record.key, record.result);
          loaded++;
        }
      } catch {
        skipped++; // truncated/corrupt final line — drop it, it'll be recomputed
      }
    }
    if (loaded > 0) {
      this.logger.info(
        `Resuming MINE from ${loaded} checkpointed article(s) at ${this.path}` +
          (skipped ? ` (skipped ${skipped} corrupt line(s))` : '')
      );
    }
    return loaded;
  }

  has(key: string): boolean {
    return this.records.has(key);
  }

  get(key: string): MineArticleResult | undefined {
    return this.records.get(key);
  }

  /** Persist one article's result and keep the in-memory index in sync. */
  async append(key: string, result: MineArticleResult): Promise<void> {
    this.records.set(key, result);
    if (!this.dirEnsured) {
      await fs.promises.mkdir(path.dirname(this.path), { recursive: true });
      this.dirEnsured = true;
    }
    await fs.promises.appendFile(this.path, JSON.stringify({ key, result }) + '\n');
  }
}

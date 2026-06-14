/**
 * In-run processed-file registry — the "don't re-read already-processed files" gate.
 *
 * One shared instance per run, consulted by the file worklist (and, later, the
 * Phase-1 network fetcher) so a file is read/extracted **at most once** no matter
 * how it's reached: overlapping globs, reference-following (an INDEX doc linking to
 * everything), or fetch. Primary identity is the canonical corpus-relative path id
 * (`toRelPathId`); an optional content-hash secondary catches the same content under
 * a different path (symlink/copy).
 *
 * Distinct from the resume checkpoint (`CheckpointService`): that dedups per-CHUNK
 * LLM extraction ACROSS runs; this dedups whole-file READS WITHIN a run. They compose.
 */
export class ProcessedRegistry {
  private readonly ids = new Set<string>();
  private readonly hashes = new Set<string>();

  /** Already processed this run — by path id, or (if given) by identical content. */
  has(relPathId: string, contentHash?: string): boolean {
    return this.ids.has(relPathId) || (contentHash !== undefined && this.hashes.has(contentHash));
  }

  /** Record a file as processed. Idempotent. */
  mark(relPathId: string, contentHash?: string): void {
    this.ids.add(relPathId);
    if (contentHash !== undefined) this.hashes.add(contentHash);
  }

  /** Count of distinct files processed (by path id). */
  get size(): number {
    return this.ids.size;
  }
}

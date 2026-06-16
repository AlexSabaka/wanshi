import * as fs from 'fs';
import * as path from 'path';
import { FileReader, FileReadResult, ChunkResult } from './FileReader';
import { Logger } from '../../../shared';
import { TextChunker } from '../chunking';

export interface JsonReaderOptions {
  /** "structural" (default): compact + split on JSON structure. "raw": compact
   * the whole doc then split as text (legacy-ish, no element awareness). */
  strategy?: 'structural' | 'raw';
  /** Target max chunk size in characters (defaults to the global chunk size). */
  maxChunkSize?: number;
}

/**
 * Token-efficient JSON reader.
 *
 * Re-serializes JSON compactly (strips insignificant whitespace) and chunks on
 * structure rather than newlines/commas: a top-level array is packed by element,
 * an object with a dominant array (e.g. `{conversations:[…]}`) is split by that
 * array's elements (carrying a compact header of sibling keys), and `.jsonl` is
 * split per line. Oversized single elements recurse one level (e.g. a big
 * conversation split by its messages). Malformed JSON falls back to raw text
 * chunking so the reader never throws.
 *
 * Registered before TextReader so it claims `.json`/`.jsonl`/`.geojson`.
 */
export class JsonFileReader extends FileReader {
  private readonly strategy: 'structural' | 'raw';
  private readonly maxChunkSize: number;

  constructor(options: JsonReaderOptions, chunker: TextChunker, logger: Logger) {
    super(['.json', '.jsonl', '.geojson'], chunker, logger);
    this.strategy = options.strategy ?? 'structural';
    this.maxChunkSize = options.maxChunkSize && options.maxChunkSize > 0
      ? options.maxChunkSize
      : 8000;
  }

  getName(): string {
    return 'JsonFileReader';
  }

  adapterId(): string {
    return 'json';
  }

  async read(filePath: string): Promise<FileReadResult> {
    await this.validateFile(filePath);
    this.logger.debug(`Reading JSON file: ${filePath}`);

    const raw = await fs.promises.readFile(filePath, 'utf-8');
    const ext = path.extname(filePath).toLowerCase();

    if (this.strategy === 'raw') {
      return this.rawResult(raw, 'json-raw');
    }

    let contents: string[];
    let format: string;
    try {
      if (ext === '.jsonl') {
        const items = raw
          .split('\n')
          .map((l) => l.trim())
          .filter(Boolean)
          .map((l) => JSON.parse(l));
        contents = await this.packArray(items, '');
        format = 'jsonl';
      } else {
        contents = await this.buildChunks(JSON.parse(raw));
        format = 'json';
      }
    } catch (error) {
      this.logger.warn(
        `Structured JSON parse failed for ${filePath}; falling back to raw text chunking: ${error}`
      );
      return this.rawResult(raw, 'json-fallback');
    }

    if (contents.length === 0) contents = ['']; // empty doc → one empty chunk
    return this.toResult(contents, format, raw.length);
  }

  /** Split a parsed JSON value into compact, structure-aligned chunk strings. */
  private async buildChunks(value: unknown): Promise<string[]> {
    const compact = JSON.stringify(value) ?? 'null';
    if (compact.length <= this.maxChunkSize) return [compact];

    if (Array.isArray(value)) {
      return this.packArray(value, '');
    }
    if (value && typeof value === 'object') {
      const arrayKey = this.dominantArrayKey(value as Record<string, unknown>);
      if (arrayKey) {
        const header = this.compactHeader(value as Record<string, unknown>, arrayKey);
        return this.packArray((value as Record<string, unknown>)[arrayKey] as unknown[], header, arrayKey);
      }
    }
    // No array to split on — degrade to raw text splitting of the compact JSON.
    this.logger.warn(
      'JSON value exceeds chunk size with no array to split on; using raw text split'
    );
    const chunks = await this.chunker.chunk(compact);
    return chunks.map((c) => c.content);
  }

  /** Pack array elements into size-bounded chunks; recurse into oversized ones. */
  private async packArray(
    arr: unknown[],
    header: string,
    arrayKey?: string
  ): Promise<string[]> {
    const out: string[] = [];
    let batch: unknown[] = [];
    let batchLen = header.length + 2;

    const flush = () => {
      if (batch.length) {
        out.push(this.wrap(header, arrayKey, batch));
        batch = [];
        batchLen = header.length + 2;
      }
    };

    for (const el of arr) {
      const s = JSON.stringify(el) ?? 'null';
      if (s.length > this.maxChunkSize) {
        flush();
        // Recurse one level (e.g. a huge conversation → split by its messages).
        const sub = await this.buildChunks(el);
        out.push(...sub);
        continue;
      }
      if (batch.length && batchLen + s.length + 1 > this.maxChunkSize) flush();
      batch.push(el);
      batchLen += s.length + 1;
    }
    flush();
    return out;
  }

  /** Wrap a batch of elements back into compact JSON, restoring the array key. */
  private wrap(header: string, arrayKey: string | undefined, batch: unknown[]): string {
    const arr = JSON.stringify(batch);
    if (arrayKey) {
      const k = JSON.stringify(arrayKey);
      return header ? `{${header},${k}:${arr}}` : `{${k}:${arr}}`;
    }
    return header ? `{${header},"items":${arr}}` : arr;
  }

  /** Compact serialization of an object's non-array sibling keys (small header). */
  private compactHeader(obj: Record<string, unknown>, arrayKey: string): string {
    const header = Object.entries(obj)
      .filter(([k]) => k !== arrayKey)
      .map(([k, v]) => `${JSON.stringify(k)}:${JSON.stringify(v)}`)
      .join(',');
    // Keep headers small so they don't dominate every chunk.
    return header.length <= Math.floor(this.maxChunkSize / 4) ? header : '';
  }

  /** Pick the object property holding the largest array (by serialized size). */
  private dominantArrayKey(obj: Record<string, unknown>): string | undefined {
    let best: string | undefined;
    let bestSize = 0;
    for (const [k, v] of Object.entries(obj)) {
      if (Array.isArray(v) && v.length > 0) {
        const size = JSON.stringify(v).length;
        if (size > bestSize) {
          bestSize = size;
          best = k;
        }
      }
    }
    return best;
  }

  private toResult(contents: string[], format: string, size: number): FileReadResult {
    let offset = 0;
    const chunks: ChunkResult[] = contents.map((content, i) => {
      const start = offset;
      offset += content.length;
      return {
        content,
        index: i + 1,
        totalChunks: contents.length,
        startOffset: start,
        endOffset: offset,
      };
    });
    this.logger.info(`Split JSON into ${chunks.length} structure-aware chunk(s)`);
    return { chunks, metadata: { type: 'json', format, size } };
  }

  private async rawResult(raw: string, format: string): Promise<FileReadResult> {
    // Compact first if it parses, otherwise chunk the raw text as-is.
    let text = raw;
    try {
      text = JSON.stringify(JSON.parse(raw));
    } catch {
      /* keep raw */
    }
    const chunks = await this.chunker.chunk(text);
    return { chunks, metadata: { type: 'json', format, size: raw.length } };
  }
}

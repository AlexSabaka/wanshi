import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { BenchmarkSample, IDatasetLoader, Triplet } from './IDataset';

// Actual CrossRE JSON line format:
// {
//   doc_key: "news-test-1",
//   sentence: ["token", ...],
//   ner: [[start, end, "entity-type"], ...],
//   relations: [[start1, end1, start2, end2, "relation-type", "Exp", Un, SA], ...]
// }
interface CrossRERawLine {
  doc_key: string;
  sentence: string[];
  ner: [number, number, string][];
  relations: [number, number, number, number, string, string, boolean, boolean][];
}

export class CrossREDataset implements IDatasetLoader {
  /**
   * Load CrossRE samples.
   *
   * @param dataPath  Path to a single domain JSON file  OR  a directory
   *                  containing multiple `*-test.json` / `*-dev.json` files.
   *                  When a directory is given every `.json` file inside is loaded.
   * @param limit     Maximum total samples to return (applied across all files).
   * @param domain    Optional domain filter.  Accepts a single domain string
   *                  (e.g. `"ai"`) or a comma-separated list (e.g. `"ai,news,science"`).
   *                  When omitted all domains are included.
   */
  async load(dataPath: string, limit: number, domain?: string): Promise<BenchmarkSample[]> {
    if (!fs.existsSync(dataPath)) {
      throw new Error(
        `CrossRE data path not found: ${dataPath}\n` +
        `Pass a single domain file (e.g. ./data/crossre/crossre_data/ai-test.json)\n` +
        `or the crossre_data/ directory to load all domain splits.\n` +
        `Files are available at: https://github.com/mainlp/CrossRE/tree/main/crossre_data`
      );
    }

    // Normalise domain filter: "ai,news,science" → Set { "ai", "news", "science" }
    const domainFilter: Set<string> | null = domain
      ? new Set(domain.split(',').map(d => d.trim()).filter(Boolean))
      : null;

    const files = this.resolveFiles(dataPath);
    const samples: BenchmarkSample[] = [];

    for (const file of files) {
      if (samples.length >= limit) break;
      await this.loadFile(file, limit - samples.length, domainFilter, samples);
    }

    return samples;
  }

  // ─── Private ───────────────────────────────────────────────────────────────

  /** Return a sorted list of JSON files to load. */
  private resolveFiles(dataPath: string): string[] {
    const stat = fs.statSync(dataPath);
    if (stat.isDirectory()) {
      return fs.readdirSync(dataPath)
        .filter(f => f.endsWith('.json'))
        .sort()
        .map(f => path.join(dataPath, f));
    }
    return [dataPath];
  }

  private async loadFile(
    filePath: string,
    limit: number,
    domainFilter: Set<string> | null,
    out: BenchmarkSample[]
  ): Promise<void> {
    const stream = fs.createReadStream(filePath, { encoding: 'utf-8' });
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

    // WS-01: `limit` is THIS file's remaining budget. Guard against how many rows
    // this file has contributed (out.length - startLen), not the cumulative array
    // size — otherwise once file 1 fills `out`, every later domain file breaks on
    // its first iteration and a finite --limit collapses to a single domain.
    const startLen = out.length;
    for await (const line of rl) {
      if (out.length - startLen >= limit) break;
      const trimmed = line.trim();
      if (!trimmed) continue;

      let raw: CrossRERawLine;
      try {
        raw = JSON.parse(trimmed);
      } catch {
        continue;
      }

      const tokens    = raw.sentence || [];
      const nerTuples = raw.ner || [];
      const relTuples = raw.relations || [];

      if (tokens.length === 0 || nerTuples.length === 0 || relTuples.length === 0) continue;

      // Extract domain from doc_key prefix (e.g. "news-test-1" -> "news")
      const detectedDomain = raw.doc_key.split('-')[0];

      // Filter by domain if specified
      if (domainFilter && !domainFilter.has(detectedDomain)) continue;

      // Build span→mention lookup: "start,end" -> mention string
      const spanToMention = new Map<string, string>();
      for (const [start, end] of nerTuples) {
        const mention = tokens.slice(start, end + 1).join(' ');
        spanToMention.set(`${start},${end}`, mention);
      }

      // Each relation tuple: [start1, end1, start2, end2, rel-type, ...]
      const groundTruth: Triplet[] = [];
      for (const [s1, e1, s2, e2, relType] of relTuples) {
        const subject = spanToMention.get(`${s1},${e1}`);
        const object  = spanToMention.get(`${s2},${e2}`);
        if (subject && object) {
          groundTruth.push({ subject, predicate: relType, object });
        }
      }

      if (groundTruth.length === 0) continue;

      out.push({
        id: raw.doc_key,
        text: tokens.join(' '),
        groundTruth,
        domain: detectedDomain,
      });
    }
  }
}

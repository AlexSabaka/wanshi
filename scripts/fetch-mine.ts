#!/usr/bin/env ts-node
/**
 * Fetch the MINE benchmark → data/mine/mine.jsonl
 *
 * Pulls rows from the HF datasets-server JSON API (no parquet dep) and writes one
 * projected row per line — only the 7 fields MineDataset reads (essay + facts +
 * the three baseline graphs), dropping the bulky stored judge responses. Rows are
 * fetched one at a time because each carries a large essay + three graphs (larger
 * pages risk per-cell truncation). Idempotent; network-gated; run once.
 *
 *   npx ts-node scripts/fetch-mine.ts
 */
import * as fs from 'fs';
import * as path from 'path';

const DATASET = 'josancamon/kg-gen-MINE-evaluation-dataset';
const OUT_DIR = path.resolve(__dirname, '..', 'data', 'mine');
const OUT_PATH = path.join(OUT_DIR, 'mine.jsonl');

// Only the fields MineDataset.parseRow consumes.
const KEEP = [
  'id',
  'essay_topic',
  'essay_content',
  'generated_queries',
  'kggen',
  'graphrag_kg',
  'openie_kg',
] as const;

interface RowsResponse {
  rows: { row: Record<string, unknown>; truncated_cells?: string[] }[];
  num_rows_total: number;
}

async function fetchRow(offset: number): Promise<RowsResponse> {
  const url =
    `https://datasets-server.huggingface.co/rows?dataset=${encodeURIComponent(DATASET)}` +
    `&config=default&split=train&offset=${offset}&length=1`;
  for (let attempt = 1; attempt <= 4; attempt++) {
    const res = await fetch(url);
    if (res.ok) return (await res.json()) as RowsResponse;
    if (res.status === 429 || res.status >= 500) {
      await new Promise((r) => setTimeout(r, attempt * 1000));
      continue;
    }
    throw new Error(`HF rows API ${res.status} @${offset}: ${await res.text()}`);
  }
  throw new Error(`HF rows API kept failing @${offset}`);
}

function project(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of KEEP) out[k] = row[k];
  return out;
}

async function main(): Promise<void> {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  console.log(`Fetching ${DATASET} …`);

  const lines: string[] = [];
  let offset = 0;
  let total = Infinity;
  let truncatedCount = 0;

  while (offset < total) {
    const page = await fetchRow(offset);
    total = page.num_rows_total;
    if (page.rows.length === 0) break;
    const entry = page.rows[0];
    if (entry.truncated_cells && entry.truncated_cells.length > 0) {
      truncatedCount++;
      console.warn(`\n  ⚠ row ${offset} truncated cells: ${entry.truncated_cells.join(', ')}`);
    }
    lines.push(JSON.stringify(project(entry.row)));
    offset += 1;
    process.stdout.write(`\r  ${offset}/${total}`);
  }
  process.stdout.write('\n');

  fs.writeFileSync(OUT_PATH, lines.join('\n') + '\n');
  console.log(`  → wrote ${lines.length} articles to ${OUT_PATH}`);
  if (truncatedCount > 0) {
    console.warn(`  ⚠ ${truncatedCount} rows had truncated cells (essay/graph may be incomplete).`);
  }
  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

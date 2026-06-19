#!/usr/bin/env ts-node
/**
 * Fetch SemEval-2010 Task 8 → data/semeval/{train,test}.jsonl
 *
 * Pulls rows from the HF datasets-server JSON API (no parquet dep) and writes one
 * { sentence, relation } object per line — the shape SemEval2010Dataset reads.
 * Idempotent: overwrites the output files. Network-gated, run once.
 *
 *   npx ts-node scripts/fetch-semeval.ts
 */
import * as fs from 'fs';
import * as path from 'path';
import { SEMEVAL_LABELS } from '../src/evaluation/datasets/SemEval2010Dataset';

const DATASET = 'SemEvalWorkshop/sem_eval_2010_task_8';
const OUT_DIR = path.resolve(__dirname, '..', 'data', 'semeval');
const PAGE = 100; // SemEval cells are tiny → max page size is safe (no cell truncation)

interface RowsResponse {
  rows: { row: { sentence: string; relation: number | string } }[];
  num_rows_total: number;
}

async function fetchPage(split: string, offset: number): Promise<RowsResponse> {
  const url =
    `https://datasets-server.huggingface.co/rows?dataset=${encodeURIComponent(DATASET)}` +
    `&config=default&split=${split}&offset=${offset}&length=${PAGE}`;
  for (let attempt = 1; attempt <= 4; attempt++) {
    const res = await fetch(url);
    if (res.ok) return (await res.json()) as RowsResponse;
    if (res.status === 429 || res.status >= 500) {
      await new Promise((r) => setTimeout(r, attempt * 1000));
      continue;
    }
    throw new Error(`HF rows API ${res.status} for ${split}@${offset}: ${await res.text()}`);
  }
  throw new Error(`HF rows API kept failing for ${split}@${offset}`);
}

async function fetchSplit(split: string): Promise<void> {
  const outPath = path.join(OUT_DIR, `${split}.jsonl`);
  const lines: string[] = [];
  let offset = 0;
  let total = Infinity;

  while (offset < total) {
    const page = await fetchPage(split, offset);
    total = page.num_rows_total;
    if (page.rows.length === 0) break;
    for (const { row } of page.rows) {
      // Resolve the ClassLabel integer to its canonical string for a readable,
      // self-contained JSONL (the loader also tolerates the raw integer).
      const relation =
        typeof row.relation === 'number' ? SEMEVAL_LABELS[row.relation] ?? row.relation : row.relation;
      lines.push(JSON.stringify({ sentence: row.sentence, relation }));
    }
    offset += page.rows.length;
    process.stdout.write(`\r  ${split}: ${offset}/${total}`);
  }
  process.stdout.write('\n');
  fs.writeFileSync(outPath, lines.join('\n') + '\n');
  console.log(`  → wrote ${lines.length} rows to ${outPath}`);
}

async function main(): Promise<void> {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  console.log(`Fetching ${DATASET} …`);
  for (const split of ['train', 'test']) {
    await fetchSplit(split);
  }
  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

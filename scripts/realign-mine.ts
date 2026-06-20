#!/usr/bin/env ts-node
/**
 * Re-align the MINE baseline graphs to their essays → data/mine/mine.aligned.jsonl
 *
 * The HF mirror (josancamon/kg-gen-MINE-evaluation-dataset) has its baseline-graph
 * columns DESYNCED from the essays: `upload_dataset.py` pairs essays[idx-1] with
 * results/<tool>/{idx}.json by file index, but the essay array order diverges from
 * the results numbering past ~row 18 (a clean off-by-one — essay 19 carries the
 * board-games graph; its true graph sits at row 20). The canonical data files
 * (essays.json / answers.json / results/) are NOT committed to the GitHub repo, so
 * the mirror is the only artifact — but it contains ALL the graphs, just permuted.
 *
 * Each essay+facts pair is internally correct (only the graphs moved), so we recover
 * the true pairing by CONTENT: for each essay, pick the graph (from that tool's pool
 * across all rows) whose entities best appear in the essay. The match is unambiguous
 * (best ~0.98 vs 2nd ~0.22), so this is reconstruction, not guesswork. A baseline
 * with no confident match is left out (the loader's alignment guard is the backstop).
 *
 *   npx ts-node scripts/realign-mine.ts            # data/mine/mine.jsonl -> .aligned.jsonl
 *   IN=… OUT=… npx ts-node scripts/realign-mine.ts
 */
import * as fs from 'fs';
import * as path from 'path';

const IN = process.env.IN || path.resolve(__dirname, '..', 'data', 'mine', 'mine.jsonl');
const OUT = process.env.OUT || path.resolve(__dirname, '..', 'data', 'mine', 'mine.aligned.jsonl');

const TOOLS = ['kggen', 'graphrag_kg', 'openie_kg'] as const;
const MIN_OVERLAP = 0.3;   // best match must clear this to be accepted
const MIN_MARGIN = 0.1;    // best must beat 2nd-best by this (unambiguous)

interface RawGraph { entities?: string[]; edges?: string[]; relations?: unknown[] }
interface Row { essay_content?: string; [k: string]: unknown }

/** Fraction of a graph's entity names that appear (case-insensitive) in the essay. */
function overlap(essay: string, graph: RawGraph | undefined): number {
  const ents = graph?.entities ?? [];
  if (ents.length === 0) return 0;
  const hay = essay.toLowerCase();
  let hit = 0;
  for (const e of ents) if (e && hay.includes(String(e).toLowerCase())) hit++;
  return hit / ents.length;
}

function main(): void {
  const rows: Row[] = fs
    .readFileSync(IN, 'utf-8')
    .trim()
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l));

  console.log(`Loaded ${rows.length} rows from ${IN}`);

  const out = rows.map((r) => ({ ...r }));

  for (const tool of TOOLS) {
    // Pool: every row's graph for this tool (the permuted set).
    const pool = rows.map((r, i) => ({ i, g: r[tool] as RawGraph | undefined }));
    const assignedTo = new Map<number, number>(); // poolIndex -> essayIndex (collision check)
    let matched = 0, ambiguous = 0, nomatch = 0, collisions = 0;

    rows.forEach((r, essayIdx) => {
      const essay = r.essay_content || '';
      const ranked = pool
        .map((p) => ({ i: p.i, s: overlap(essay, p.g) }))
        .sort((a, b) => b.s - a.s);
      const best = ranked[0];
      const second = ranked[1] ?? { i: -1, s: 0 };

      if (!best || best.s < MIN_OVERLAP) {
        (out[essayIdx] as Row)[tool] = null;
        nomatch++;
        return;
      }
      if (best.s - second.s < MIN_MARGIN) {
        // Ambiguous: keep the index-paired graph only if IT aligns, else drop.
        const own = rows[essayIdx][tool] as RawGraph | undefined;
        (out[essayIdx] as Row)[tool] = overlap(essay, own) >= MIN_OVERLAP ? own : null;
        ambiguous++;
        return;
      }
      if (assignedTo.has(best.i)) collisions++;
      assignedTo.set(best.i, essayIdx);
      (out[essayIdx] as Row)[tool] = rows[best.i][tool];
      matched++;
    });

    console.log(
      `  ${tool.padEnd(11)} matched ${matched}  ambiguous ${ambiguous}  nomatch ${nomatch}` +
        (collisions ? `  ⚠ ${collisions} collisions` : '')
    );
  }

  fs.writeFileSync(OUT, out.map((r) => JSON.stringify(r)).join('\n') + '\n');
  console.log(`\n→ ${OUT} (${out.length} rows, baselines re-paired by content)`);
}

main();

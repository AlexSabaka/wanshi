import * as fs from 'fs';
import * as readline from 'readline';
import { Entity, KnowledgeGraph, Relation } from '../../types/KnowledgeGraph';
import { MineBaselineGraphRaw, MineSample } from './types';

// MINE benchmark (KGGen paper). One JSON object per line, written by
// scripts/fetch-mine.ts from josancamon/kg-gen-MINE-evaluation-dataset:
//   { id, essay_topic, essay_content, generated_queries: string[],
//     num_generated_queries, kggen|graphrag_kg|openie_kg:
//       { entities: string[], edges: string[], relations: [s,p,o][] }, ... }
//
// Each `generated_query` is an atomic fact used BOTH to retrieve KG context AND as
// the statement the judge verifies (in the mirror, generated_queries[i] ===
// *_responses[i].correct_answer). So a MINE sample carries a flat list of facts.

interface MineRawRow {
  id?: number | string;
  essay_topic?: string;
  essay_content?: string;
  generated_queries?: string[];
  kggen?: MineBaselineGraphRaw;
  graphrag_kg?: MineBaselineGraphRaw;
  openie_kg?: MineBaselineGraphRaw;
}

export class MineDataset {
  async load(dataPath: string, limit: number): Promise<MineSample[]> {
    if (!fs.existsSync(dataPath)) {
      throw new Error(
        `MINE data not found at: ${dataPath}\n` +
        `Fetch it first:  npx ts-node scripts/fetch-mine.ts\n` +
        `(downloads josancamon/kg-gen-MINE-evaluation-dataset → data/mine/mine.jsonl)`
      );
    }

    const samples: MineSample[] = [];
    const stream = fs.createReadStream(dataPath, { encoding: 'utf-8' });
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

    for await (const line of rl) {
      if (samples.length >= limit) break;
      const trimmed = line.trim();
      if (!trimmed) continue;

      let raw: MineRawRow;
      try {
        raw = JSON.parse(trimmed);
      } catch {
        continue;
      }

      const sample = MineDataset.parseRow(raw, samples.length);
      if (sample) samples.push(sample);
    }

    return samples;
  }

  /** Pure row → MineSample mapping (static for unit testing without a file). */
  static parseRow(raw: MineRawRow, index: number): MineSample | null {
    const text = raw.essay_content;
    const facts = raw.generated_queries;
    if (!text || !facts || facts.length === 0) return null;

    return {
      id: String(raw.id ?? index),
      topic: raw.essay_topic ?? '',
      text,
      facts,
      baselines: {
        kggen: MineDataset.toGraph(raw.kggen),
        graphrag: MineDataset.toGraph(raw.graphrag_kg),
        openie: MineDataset.toGraph(raw.openie_kg),
      },
    };
  }

  /** Map a stored {entities, edges, relations} baseline graph to a wanshi
   *  KnowledgeGraph so every tool flows through the one identical scorer. */
  static toGraph(raw: MineBaselineGraphRaw | undefined): KnowledgeGraph {
    if (!raw) return { entities: [], relations: [] };

    const names = new Set<string>();
    const entities: Entity[] = [];
    const ensure = (name: string) => {
      const n = name?.trim();
      if (!n || names.has(n)) return;
      names.add(n);
      entities.push({ name: n, entityType: 'concept', observations: [], files: [] });
    };

    for (const e of raw.entities ?? []) ensure(e);

    const relations: Relation[] = [];
    for (const t of raw.relations ?? []) {
      if (!Array.isArray(t) || t.length < 3) continue;
      const [from, predicate, to] = [String(t[0]).trim(), String(t[1]).trim(), String(t[2]).trim()];
      if (!from || !to) continue;
      ensure(from);
      ensure(to);
      relations.push({ from, to, relationType: [predicate || 'related to'] });
    }

    return { entities, relations };
  }
}

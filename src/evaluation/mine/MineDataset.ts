import * as fs from 'fs';
import * as readline from 'readline';
import { Entity, KnowledgeGraph, Relation } from '../../types/KnowledgeGraph';
import { Logger } from '../../shared';
import { MineBaselineGraphRaw, MineSample, MineTool } from './types';

/**
 * Alignment guard threshold. The third-party HF mirror
 * (josancamon/kg-gen-MINE-evaluation-dataset) ships baseline-graph columns that
 * are DESYNCED from the essays past ~row 18 (verified against the live API: row 19
 * is a VR essay carrying a board-games kggen graph). A misaligned baseline scores
 * ~0 on every fact and silently poisons the four-way table. Guard: a baseline whose
 * entities barely appear in its own essay belongs to a different article — drop it
 * so it's excluded from scoring rather than counted as a (fake) zero. Aligned rows
 * overlap ≥0.4; misaligned ~0.05, so 0.25 cleanly separates with margin.
 */
const MIN_BASELINE_ALIGNMENT = 0.25;

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
  async load(dataPath: string, limit: number, logger?: Logger): Promise<MineSample[]> {
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

    MineDataset.guardBaselineAlignment(samples, logger);
    return samples;
  }

  /**
   * Drop baseline graphs that don't belong to their essay (the HF mirror's
   * essay↔graph desync). Mutates each sample's `baselines`, removing any non-empty
   * graph whose entities barely appear in the essay; a dropped baseline is then
   * skipped by the runner (so it never counts as a fake zero). Logs a per-tool tally
   * — a high drop count is the loud signal that the data source is corrupt.
   */
  static guardBaselineAlignment(samples: MineSample[], logger?: Logger): void {
    const dropped: Record<string, number> = {};
    for (const s of samples) {
      for (const tool of Object.keys(s.baselines) as Exclude<MineTool, 'wanshi'>[]) {
        const g = s.baselines[tool];
        if (!g || g.entities.length === 0) continue; // empty = legit absence, not misalignment
        if (MineDataset.alignmentScore(s.text, g) < MIN_BASELINE_ALIGNMENT) {
          delete s.baselines[tool];
          dropped[tool] = (dropped[tool] ?? 0) + 1;
        }
      }
    }
    const total = Object.values(dropped).reduce((a, b) => a + b, 0);
    if (total > 0 && logger) {
      const detail = Object.entries(dropped).map(([t, n]) => `${t}:${n}`).join(' ');
      logger.warn(
        `MINE alignment guard dropped ${total} misaligned baseline graph(s) [${detail}] ` +
          `across ${samples.length} articles — the source's essay↔graph columns are desynced. ` +
          `Those (tool,article) cells are excluded from the four-way (not scored as 0).`
      );
    }
  }

  /** Fraction of a graph's entity names that appear (case-insensitive substring)
   *  in the essay. ~1 when the graph is this essay's; ~0 when it's another's. */
  static alignmentScore(text: string, graph: KnowledgeGraph): number {
    const ents = graph.entities;
    if (ents.length === 0) return 0;
    const hay = text.toLowerCase();
    let hit = 0;
    for (const e of ents) if (e.name && hay.includes(e.name.toLowerCase())) hit++;
    return hit / ents.length;
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

import * as fs from 'fs';
import * as readline from 'readline';
import { BenchmarkSample, IDatasetLoader, Triplet } from './IDataset';

// SemEval-2010 Task 8 — multi-way classification of semantic relations between
// two marked nominals. Source: SemEvalWorkshop/sem_eval_2010_task_8 (HF).
// `scripts/fetch-semeval.ts` writes one JSON object per line:
//   { "sentence": "The <e1>system</e1> produces a loud <e2>sound</e2>.",
//     "relation": "Cause-Effect(e2,e1)"  // or the ClassLabel integer 0..18 }
//
// Each instance carries exactly TWO gold nominals and ONE directed relation, so
// it maps to a single gold triplet. The directional suffix `(e1,e2)`/`(e2,e1)`
// decides subject/object order; the base label (e.g. "Cause-Effect") is the
// predicate. The meaningful metric here is ENTITY-CAPTURE (entity-level recall —
// did the extractor surface both nominals); triple-F1 understates because open
// extraction won't emit SemEval's abstract relation vocabulary (see SCORING.md).

interface SemEvalRawLine {
  sentence?: string;
  relation?: string | number;
}

/** The 19 ClassLabel names, in index order (HF schema). Used to resolve an
 *  integer `relation` to its string label; canonical and fixed. */
export const SEMEVAL_LABELS = [
  'Cause-Effect(e1,e2)',     'Cause-Effect(e2,e1)',
  'Component-Whole(e1,e2)',  'Component-Whole(e2,e1)',
  'Content-Container(e1,e2)','Content-Container(e2,e1)',
  'Entity-Destination(e1,e2)','Entity-Destination(e2,e1)',
  'Entity-Origin(e1,e2)',    'Entity-Origin(e2,e1)',
  'Instrument-Agency(e1,e2)','Instrument-Agency(e2,e1)',
  'Member-Collection(e1,e2)','Member-Collection(e2,e1)',
  'Message-Topic(e1,e2)',    'Message-Topic(e2,e1)',
  'Product-Producer(e1,e2)', 'Product-Producer(e2,e1)',
  'Other',
];

export class SemEval2010Dataset implements IDatasetLoader {
  async load(dataPath: string, limit: number, domain?: string): Promise<BenchmarkSample[]> {
    if (!fs.existsSync(dataPath)) {
      throw new Error(
        `SemEval-2010 Task 8 data not found at: ${dataPath}\n` +
        `Fetch it first:  npx ts-node scripts/fetch-semeval.ts\n` +
        `(downloads SemEvalWorkshop/sem_eval_2010_task_8 → data/semeval/{train,test}.jsonl)`
      );
    }

    const samples: BenchmarkSample[] = [];
    const stream = fs.createReadStream(dataPath, { encoding: 'utf-8' });
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

    for await (const line of rl) {
      if (samples.length >= limit) break;
      const trimmed = line.trim();
      if (!trimmed) continue;

      let raw: SemEvalRawLine;
      try {
        raw = JSON.parse(trimmed);
      } catch {
        continue;
      }

      const sample = SemEval2010Dataset.parseInstance(raw, samples.length);
      if (sample) samples.push(sample);
    }

    return samples;
  }

  /** Parse one raw line into a BenchmarkSample (or null when malformed). Static
   *  + exported-via-class so the unit test can exercise it without a file. */
  static parseInstance(raw: SemEvalRawLine, index: number): BenchmarkSample | null {
    const sentence = raw.sentence;
    if (!sentence) return null;

    const e1 = sentence.match(/<e1>([\s\S]*?)<\/e1>/)?.[1]?.trim();
    const e2 = sentence.match(/<e2>([\s\S]*?)<\/e2>/)?.[1]?.trim();
    if (!e1 || !e2) return null;

    const label = SemEval2010Dataset.resolveLabel(raw.relation);
    if (!label) return null;

    // "Cause-Effect(e2,e1)" → base "Cause-Effect", reversed = true.
    const base = label.replace(/\(e[12],e[12]\)\s*$/, '');
    const reversed = /\(e2,e1\)\s*$/.test(label);
    const [subject, object] = reversed ? [e2, e1] : [e1, e2];

    // Strip the entity markup (the model must not see annotation tags) and any
    // wrapping quotes the original format left on the sentence.
    const text = sentence
      .replace(/<\/?e[12]>/g, '')
      .replace(/^\s*"|"\s*$/g, '')
      .trim();

    const groundTruth: Triplet[] = [{ subject, predicate: base, object }];
    return { id: `semeval-${index}`, text, groundTruth, domain: 'semeval' };
  }

  private static resolveLabel(relation: string | number | undefined): string | null {
    if (typeof relation === 'number') return SEMEVAL_LABELS[relation] ?? null;
    if (typeof relation === 'string' && relation.length > 0) return relation;
    return null;
  }
}

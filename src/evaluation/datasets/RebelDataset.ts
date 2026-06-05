import * as fs from 'fs';
import * as readline from 'readline';
import { BenchmarkSample, IDatasetLoader, Triplet } from './IDataset';

// Actual REBEL JSON line format (Babelscape/rebel-dataset):
// {
//   docid: "30112107",
//   title: "Coburg Peak",
//   uri: "Q5139027",
//   text: "Coburg Peak is the rocky peak...",
//   entities: [{ uri, boundaries, surfaceform, annotator }, ...],
//   triples: [
//     {
//       subject:   { uri, boundaries, surfaceform, annotator },
//       predicate: { uri, boundaries, surfaceform, annotator },
//       object:    { uri, boundaries, surfaceform, annotator },
//       sentence_id, dependency_path, confidence, annotator
//     },
//     ...
//   ]
// }

interface RebelSpan {
  uri: string;
  boundaries: [number, number] | null;
  surfaceform: string;
  annotator: string;
}

interface RebelTriple {
  subject:   RebelSpan;
  predicate: RebelSpan;
  object:    RebelSpan;
  sentence_id: number | null;
  annotator: string;
}

interface RebelRawLine {
  docid?: string;
  title?: string;
  uri?: string;
  text?: string;
  entities?: RebelSpan[];
  triples?: RebelTriple[];
}

export class RebelDataset implements IDatasetLoader {
  async load(dataPath: string, limit: number): Promise<BenchmarkSample[]> {
    if (!fs.existsSync(dataPath)) {
      throw new Error(
        `REBEL dataset not found at: ${dataPath}\n` +
        `Download from: https://huggingface.co/datasets/Babelscape/rebel-dataset`
      );
    }

    const samples: BenchmarkSample[] = [];
    const stream = fs.createReadStream(dataPath, { encoding: 'utf-8' });
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

    for await (const line of rl) {
      if (samples.length >= limit) break;
      const trimmed = line.trim();
      if (!trimmed) continue;

      let raw: RebelRawLine;
      try {
        raw = JSON.parse(trimmed);
      } catch {
        continue;
      }

      const text = raw.text || '';
      if (!text || !raw.triples || raw.triples.length === 0) continue;

      const groundTruth: Triplet[] = [];
      for (const t of raw.triples) {
        const subject   = t.subject?.surfaceform?.trim();
        const predicate = t.predicate?.surfaceform?.trim();
        const object    = t.object?.surfaceform?.trim();
        if (subject && predicate && object) {
          groundTruth.push({ subject, predicate, object });
        }
      }

      if (groundTruth.length === 0) continue;

      samples.push({
        id: raw.docid || String(samples.length),
        text,
        groundTruth,
      });
    }

    return samples;
  }
}

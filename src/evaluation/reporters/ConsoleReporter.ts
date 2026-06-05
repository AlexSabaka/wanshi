import { BenchmarkResult, EvalMetrics, LevelMetrics } from '../datasets/IDataset';

function fmt(n: number): string {
  return n.toFixed(3).padStart(7);
}

function fmtDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}m ${rem}s`;
}

function printRow(label: string, exact: EvalMetrics, semantic: EvalMetrics): void {
  const pad = (s: string, w: number) => s.padEnd(w);
  console.log(
    `${pad(label, 12)}` +
    `  ${fmt(exact.precision)}  ${fmt(exact.recall)}  ${fmt(exact.f1)}` +
    `  │  ${fmt(semantic.precision)}  ${fmt(semantic.recall)}  ${fmt(semantic.f1)}`
  );
}

export class ConsoleReporter {
  print(result: BenchmarkResult): void {
    const sep = '─'.repeat(78);

    console.log('');
    console.log(`Dataset: ${result.dataset} (n=${result.sampleCount})  Model: ${result.model}  Classifier: ${result.classifier}`);
    console.log('');
    console.log(
      `${''.padEnd(12)}  ${'Exact P'.padStart(7)}  ${'Exact R'.padStart(7)}  ${'Exact F1'.padStart(7)}` +
      `  │  ${'Sem P'.padStart(7)}  ${'Sem R'.padStart(7)}  ${'Sem F1'.padStart(7)}`
    );
    console.log(sep);
    printRow('Entity',   result.exact.entity,   result.semantic.entity);
    printRow('Relation', result.exact.relation, result.semantic.relation);
    printRow('Triple',   result.exact.triple,   result.semantic.triple);
    console.log(sep);
    console.log('');

    const s = result.extractionStats;
    console.log(
      `Extraction:  avg entities/sample=${s.avgKgEntities.toFixed(1)}` +
      `  avg relations/sample=${s.avgKgRelations.toFixed(1)}`
    );
    if (s.samplesWithNoRelations > 0) {
      console.log(
        `⚠  ${s.samplesWithNoRelations}/${result.sampleCount} samples had 0 extracted relations` +
        ` — F1 is 0 for those samples regardless of entity quality.` +
        ` Intrinsic quality still reflects entity structure and may look inflated.`
      );
    }
    console.log('');

    const q = result.intrinsicQuality;
    if (q.mean > 0) {
      console.log(`Intrinsic Quality: ${q.mean.toFixed(1)}/100`);
    }

    console.log(`Duration: ${fmtDuration(result.durationMs)}`);
    console.log('');
  }
}

import * as fs from 'fs';
import * as path from 'path';
import { BenchmarkResult } from '../datasets/IDataset';

export class JsonReporter {
  save(result: BenchmarkResult, outputPath: string): void {
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(outputPath, JSON.stringify(result, null, 2), 'utf-8');
    console.log(`Report saved to: ${outputPath}`);
  }
}

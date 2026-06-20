import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { MineCheckpoint } from './MineCheckpoint';
import { MineArticleResult } from './types';

const logger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} } as any;
const article = (id: string): MineArticleResult => ({
  id,
  topic: `topic-${id}`,
  scores: { wanshi: { tool: 'wanshi', accuracy: 1, correct: 1, total: 1, perFact: [] } },
});

describe('MineCheckpoint', () => {
  let dir: string;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mine-ckpt-')); });
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  it('round-trips: append then a fresh instance loads and resumes', async () => {
    const p = path.join(dir, 'run.mine-checkpoint.jsonl');
    const a = new MineCheckpoint(p, logger);
    await a.append('k1', article('1'));
    await a.append('k2', article('2'));

    const b = new MineCheckpoint(p, logger);
    expect(await b.load()).toBe(2);
    expect(b.has('k1')).toBe(true);
    expect(b.get('k2')!.topic).toBe('topic-2');
    expect(b.has('nope')).toBe(false);
  });

  it('tolerates a truncated final line (crash mid-write)', async () => {
    const p = path.join(dir, 'run.mine-checkpoint.jsonl');
    fs.writeFileSync(p, JSON.stringify({ key: 'k1', result: article('1') }) + '\n{"key":"k2","resu');
    const c = new MineCheckpoint(p, logger);
    expect(await c.load()).toBe(1); // the good line survives, the partial is dropped
    expect(c.has('k1')).toBe(true);
  });
});

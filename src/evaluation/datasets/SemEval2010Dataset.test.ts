import { SemEval2010Dataset, SEMEVAL_LABELS } from './SemEval2010Dataset';

describe('SemEval2010Dataset.parseInstance', () => {
  it('maps a forward (e1,e2) relation to a direction-correct triplet, tags stripped', () => {
    const s = SemEval2010Dataset.parseInstance(
      { sentence: '"The <e1>burst</e1> has been caused by water <e2>hammer</e2> pressure."', relation: 'Cause-Effect(e2,e1)' },
      0
    )!;
    expect(s.text).toBe('The burst has been caused by water hammer pressure.');
    // (e2,e1) ⇒ subject is e2, object is e1
    expect(s.groundTruth).toEqual([{ subject: 'hammer', predicate: 'Cause-Effect', object: 'burst' }]);
    expect(s.domain).toBe('semeval');
  });

  it('keeps e1→e2 order for an (e1,e2) label', () => {
    const s = SemEval2010Dataset.parseInstance(
      { sentence: 'The <e1>system</e1> produces a loud <e2>sound</e2>.', relation: 'Cause-Effect(e1,e2)' },
      1
    )!;
    expect(s.groundTruth[0]).toEqual({ subject: 'system', predicate: 'Cause-Effect', object: 'sound' });
  });

  it('resolves an integer ClassLabel via SEMEVAL_LABELS', () => {
    // index 2 = "Component-Whole(e1,e2)"
    const s = SemEval2010Dataset.parseInstance(
      { sentence: 'The <e1>engine</e1> of the <e2>car</e2>.', relation: 2 },
      2
    )!;
    expect(SEMEVAL_LABELS[2]).toBe('Component-Whole(e1,e2)');
    expect(s.groundTruth[0]).toEqual({ subject: 'engine', predicate: 'Component-Whole', object: 'car' });
  });

  it('handles the "Other" label with no direction (default e1→e2)', () => {
    const s = SemEval2010Dataset.parseInstance(
      { sentence: 'A <e1>cat</e1> and a <e2>dog</e2>.', relation: 'Other' },
      3
    )!;
    expect(s.groundTruth[0]).toEqual({ subject: 'cat', predicate: 'Other', object: 'dog' });
  });

  it('returns null when a nominal is missing or the line is malformed', () => {
    expect(SemEval2010Dataset.parseInstance({ sentence: 'no entities here', relation: 0 }, 0)).toBeNull();
    expect(SemEval2010Dataset.parseInstance({ relation: 0 }, 0)).toBeNull();
    expect(SemEval2010Dataset.parseInstance({ sentence: 'The <e1>x</e1> only.', relation: undefined }, 0)).toBeNull();
  });
});

import { MineDataset } from './MineDataset';

describe('MineDataset.parseRow', () => {
  const row = {
    id: 7,
    essay_topic: 'butterflies',
    essay_content: 'Butterflies undergo metamorphosis...',
    generated_queries: ['Butterflies undergo a transformation.', 'Caterpillars become butterflies.'],
    num_generated_queries: 2,
    kggen: {
      entities: ['butterfly', 'transformation'],
      edges: ['undergo'],
      relations: [['butterfly', 'undergo', 'transformation']],
    },
    graphrag_kg: { entities: ['caterpillar'], edges: [], relations: [] },
    openie_kg: { entities: [], edges: [], relations: [] },
  };

  it('maps an article to a MineSample with facts + the three baseline graphs', () => {
    const s = MineDataset.parseRow(row, 0)!;
    expect(s.id).toBe('7');
    expect(s.topic).toBe('butterflies');
    expect(s.facts).toHaveLength(2);
    expect(s.baselines.kggen!.entities.map((e) => e.name)).toEqual(['butterfly', 'transformation']);
    expect(s.baselines.kggen!.relations[0]).toEqual({
      from: 'butterfly',
      to: 'transformation',
      relationType: ['undergo'],
    });
    expect(s.baselines.graphrag!.entities).toHaveLength(1);
    expect(s.baselines.openie!.entities).toHaveLength(0);
  });

  it('returns null when essay text or facts are missing', () => {
    expect(MineDataset.parseRow({ essay_content: 'x', generated_queries: [] }, 0)).toBeNull();
    expect(MineDataset.parseRow({ generated_queries: ['a'] }, 0)).toBeNull();
  });

  it('toGraph adds endpoints not listed in entities and tolerates short tuples', () => {
    const g = MineDataset.toGraph({
      entities: ['a'],
      relations: [['a', 'rel', 'b'], ['bad', 'tuple'] as unknown as string[]],
    });
    // 'b' was only an edge endpoint → still becomes a node; the 2-element tuple is skipped.
    expect(g.entities.map((e) => e.name).sort()).toEqual(['a', 'b']);
    expect(g.relations).toHaveLength(1);
  });
});

describe('MineDataset alignment guard (the HF mirror essay↔graph desync)', () => {
  const vrEssay =
    'Virtual reality in education. VR technology lets students explore simulations and ' +
    'practice procedures in an immersive virtual classroom.';

  it('alignmentScore is ~1 for the essay’s own graph, ~0 for a foreign one', () => {
    const own = MineDataset.toGraph({ entities: ['virtual reality', 'students', 'simulations'], relations: [] });
    const foreign = MineDataset.toGraph({ entities: ['backgammon', 'medieval', 'dice'], relations: [] });
    expect(MineDataset.alignmentScore(vrEssay, own)).toBeGreaterThanOrEqual(0.6);
    expect(MineDataset.alignmentScore(vrEssay, foreign)).toBeLessThan(0.25);
  });

  it('drops a misaligned baseline graph but keeps the aligned one', () => {
    const sample = MineDataset.parseRow(
      {
        id: 19,
        essay_topic: 'Virtual Reality in Education',
        essay_content: vrEssay,
        generated_queries: ['VR helps students learn.'],
        // kggen is THIS essay's graph; graphrag is a board-games graph (the desync bug).
        kggen: { entities: ['virtual reality', 'students'], edges: [], relations: [] },
        graphrag_kg: { entities: ['backgammon', 'medieval', 'dice'], edges: [], relations: [] },
      },
      0
    )!;
    MineDataset.guardBaselineAlignment([sample]);
    expect(sample.baselines.kggen).toBeDefined();      // aligned → kept
    expect(sample.baselines.graphrag).toBeUndefined(); // misaligned → dropped (not scored as 0)
  });
});

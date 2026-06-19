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

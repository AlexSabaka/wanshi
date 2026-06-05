import { Triplet } from '../datasets/IDataset';

export class ExactMatcher {
  normalize(s: string): string {
    return s.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
  }

  /**
   * Returns the set of extracted triplets that have at least one match
   * in groundTruth (true positives), and counts FP/FN.
   */
  matchTriplets(extracted: Triplet[], groundTruth: Triplet[]): {
    tp: number; fp: number; fn: number;
  } {
    const gtNorm = groundTruth.map(t => this.normalizeTriplet(t));
    const exNorm = extracted.map(t => this.normalizeTriplet(t));

    let tp = 0;
    const matchedGT = new Set<number>();

    for (const ex of exNorm) {
      const idx = gtNorm.findIndex((gt, i) => !matchedGT.has(i) && this.tripletsEqual(ex, gt));
      if (idx !== -1) {
        tp++;
        matchedGT.add(idx);
      }
    }

    return { tp, fp: extracted.length - tp, fn: groundTruth.length - tp };
  }

  /**
   * Matches entity sets (subjects ∪ objects), ignoring predicates.
   */
  matchEntities(extracted: Triplet[], groundTruth: Triplet[]): {
    tp: number; fp: number; fn: number;
  } {
    const gtEntities = this.extractEntitySet(groundTruth).map(e => this.normalize(e));
    const exEntities = this.extractEntitySet(extracted).map(e => this.normalize(e));
    return this.matchSets(exEntities, gtEntities);
  }

  /**
   * Matches predicate sets only.
   */
  matchRelations(extracted: Triplet[], groundTruth: Triplet[]): {
    tp: number; fp: number; fn: number;
  } {
    const gtRels = groundTruth.map(t => this.normalize(t.predicate));
    const exRels = extracted.map(t => this.normalize(t.predicate));
    return this.matchSets(exRels, gtRels);
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private normalizeTriplet(t: Triplet): Triplet {
    return {
      subject:   this.normalize(t.subject),
      predicate: this.normalize(t.predicate),
      object:    this.normalize(t.object),
    };
  }

  private tripletsEqual(a: Triplet, b: Triplet): boolean {
    return a.subject === b.subject && a.predicate === b.predicate && a.object === b.object;
  }

  private extractEntitySet(triplets: Triplet[]): string[] {
    const set = new Set<string>();
    for (const t of triplets) {
      set.add(t.subject);
      set.add(t.object);
    }
    return Array.from(set);
  }

  private matchSets(extracted: string[], groundTruth: string[]): {
    tp: number; fp: number; fn: number;
  } {
    let tp = 0;
    const matchedGT = new Set<number>();

    for (const ex of extracted) {
      const idx = groundTruth.findIndex((gt, i) => !matchedGT.has(i) && gt === ex);
      if (idx !== -1) {
        tp++;
        matchedGT.add(idx);
      }
    }

    return { tp, fp: extracted.length - tp, fn: groundTruth.length - tp };
  }
}

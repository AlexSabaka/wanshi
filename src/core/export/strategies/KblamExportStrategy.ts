import { KnowledgeGraph } from "../../../types/KnowledgeGraph";
import { obsText } from "../../../types/Observation";
import { ProcessingOptions } from "../../../types/ProcessingOptions";
import { IExportStrategy } from "./IExportStrategy";

/**
 * One KBLaM "DataPoint" — the on-disk shape KBLaM's `dataset_generation` ingests
 * (JSONL, one per line). A triple `(name, description_type, description)` plus the
 * derived Q/A/key strings KBLaM encodes into knowledge tokens.
 */
interface KblamDataPoint {
  name: string; // entity
  description_type: string; // property
  description: string; // value
  Q: string;
  A: string;
  key_string: string;
}

/**
 * Emits a kg-gen graph as KBLaM-format `(entity, property, value)` triples:
 *  - each observation → `(entity.name, "fact", obs.text)`
 *  - each relation    → `(from, relationType, to)`
 * Faithful to KBLaM's gen_synthetic_data DataPoint schema (Q/A/key_string derived
 * from the same templates), so the output can feed its KB-embedding step.
 */
export class KblamExportStrategy implements IExportStrategy {
  export(graph: KnowledgeGraph, _options?: ProcessingOptions): string {
    const lines: string[] = [];

    for (const entity of graph.entities) {
      for (const obs of entity.observations || []) {
        lines.push(JSON.stringify(this.dataPoint(entity.name, "fact", obsText(obs))));
      }
    }

    for (const relation of graph.relations) {
      const types = Array.isArray(relation.relationType)
        ? relation.relationType
        : [relation.relationType];
      for (const type of types) {
        if (!type) continue;
        lines.push(JSON.stringify(this.dataPoint(relation.from, String(type), relation.to)));
      }
    }

    return lines.join("\n");
  }

  getFormat(): string {
    return "kblam";
  }

  supportsFormat(format: string): boolean {
    return format === "kblam";
  }

  private dataPoint(name: string, property: string, value: string): KblamDataPoint {
    return {
      name,
      description_type: property,
      description: value,
      Q: `What is the ${property} of ${name}?`,
      A: `The ${property} of ${name} is ${value}.`,
      key_string: `the ${property} of ${name}`,
    };
  }
}

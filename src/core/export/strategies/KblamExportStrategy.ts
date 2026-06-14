import { KnowledgeGraph } from "../../../types/KnowledgeGraph";
import { ProcessingOptions } from "../../../types/ProcessingOptions";
import { IExportStrategy } from "./IExportStrategy";
import { toKbTriples } from "./kbTriples";

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
 * Emits a wanshi graph as KBLaM-format `(entity, property, value)` triples with
 * **unique (name, property) keys** (KG-09): observations aggregate into one
 * `description` property per entity, relations key on their predicate. Faithful to
 * KBLaM's DataPoint schema — Q/A/key_string follow the paper's templates (key
 * `"The {property} of {name}"`, Eq. 4) — so the output feeds its KB-embedding step.
 */
export class KblamExportStrategy implements IExportStrategy {
  export(graph: KnowledgeGraph, _options?: ProcessingOptions): string {
    return toKbTriples(graph)
      .map((t) => JSON.stringify(this.dataPoint(t.name, t.property, t.value)))
      .join("\n");
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
      key_string: `The ${property} of ${name}`,
    };
  }
}

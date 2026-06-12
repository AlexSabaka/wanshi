import { KnowledgeGraph } from "../../../types/KnowledgeGraph";
import { Observation } from "../../../types/Observation";
import { ProcessingOptions } from "../../../types/ProcessingOptions";
import { IExportStrategy } from "./IExportStrategy";
import { toKbTriples } from "./kbTriples";

/**
 * Harvests a graph into a LoRA / SFT fine-tuning set: chat-format instruction
 * examples (Q → A) derived from the same `(name, property, value)` triples as the
 * KBLaM export, but **quality-filtered** — observations whose `groundingScore`
 * falls below the threshold are dropped *before* aggregation, so only grounded
 * facts join an entity's `description`. Relations (structural, no per-fact score)
 * are always included. One example per unique (name, property) key (KG-09), so no
 * two examples share a question with conflicting answers.
 *
 * Output is JSONL of `{ messages: [{role:"user"}, {role:"assistant"}] }`.
 */
export class LoraExportStrategy implements IExportStrategy {
  export(graph: KnowledgeGraph, options?: ProcessingOptions): string {
    const min = options?.grounding?.minScore ?? 0.5;
    return toKbTriples(graph, (obs) => this.isGroundedEnough(obs, min))
      .map((t) => this.example(t.name, t.property, t.value))
      .join("\n");
  }

  getFormat(): string {
    return "lora";
  }

  supportsFormat(format: string): boolean {
    return format === "lora";
  }

  /** Keep when there's no score (gate off) or the score meets the threshold. */
  private isGroundedEnough(obs: Observation | string, min: number): boolean {
    if (typeof obs === "string") return true;
    return obs.groundingScore === undefined || obs.groundingScore >= min;
  }

  private example(name: string, property: string, value: string): string {
    return JSON.stringify({
      messages: [
        { role: "user", content: `What is the ${property} of ${name}?` },
        { role: "assistant", content: `The ${property} of ${name} is ${value}.` },
      ],
    });
  }
}

import { KnowledgeGraph } from "../../../types/KnowledgeGraph";
import { Observation, obsText } from "../../../types/Observation";
import { ProcessingOptions } from "../../../types/ProcessingOptions";
import { IExportStrategy } from "./IExportStrategy";

/**
 * Harvests a graph into a LoRA / SFT fine-tuning set: chat-format instruction
 * examples (Q → A) derived from the same triples as the KBLaM export, but
 * **quality-filtered** — observations whose Phase-3 `groundingScore` falls below
 * the threshold are dropped so the training set carries only grounded facts.
 * Relations (structural, no per-fact score) are always included.
 *
 * Output is JSONL of `{ messages: [{role:"user"}, {role:"assistant"}] }`.
 */
export class LoraExportStrategy implements IExportStrategy {
  export(graph: KnowledgeGraph, options?: ProcessingOptions): string {
    const min = options?.grounding?.minScore ?? 0.5;
    const lines: string[] = [];

    for (const entity of graph.entities) {
      for (const obs of entity.observations || []) {
        if (!this.isGroundedEnough(obs, min)) continue;
        lines.push(this.example(entity.name, "fact", obsText(obs)));
      }
    }

    for (const relation of graph.relations) {
      const types = Array.isArray(relation.relationType)
        ? relation.relationType
        : [relation.relationType];
      for (const type of types) {
        if (!type) continue;
        lines.push(this.example(relation.from, String(type), relation.to));
      }
    }

    return lines.join("\n");
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

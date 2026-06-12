import { KnowledgeGraph, Entity, Relation } from "../../../types/KnowledgeGraph";
import { ProcessingOptions } from "../../../types/ProcessingOptions";
import { normalizeObservations } from "../../../types/Observation";
import { IExportStrategy } from "./IExportStrategy";

/**
 * Strategy for exporting Knowledge Graphs to JSONL format
 * Each line contains a JSON object (entity or relation)
 */
export class JsonlExportStrategy implements IExportStrategy {
  export(graph: KnowledgeGraph, processingOptions?: ProcessingOptions): string {
    const lines: string[] = [];

    // Add entities as JSONL
    graph.entities.forEach((entity) => {
      lines.push(JSON.stringify({ type: "entity", ...entity }));
    });

    // Add relations as JSONL
    graph.relations.forEach((relation) => {
      lines.push(JSON.stringify({ type: "relation", ...relation }));
    });

    return lines.join("\n");
  }

  getFormat(): string {
    return "jsonl";
  }

  supportsFormat(format: string): boolean {
    return format === "jsonl";
  }

  /**
   * Parse JSONL/`mcp-jsonl` content back into a KnowledgeGraph (KG-11). Each line
   * is one `{type:"entity"|"relation", …}` object; malformed lines are skipped
   * silently (a truncated final line from an interrupted write is tolerated).
   * `mcp-jsonl` downgrades observations to bare strings — `normalizeObservations`
   * coerces those back into `Observation` objects so both shapes round-trip.
   */
  static fromJSONL(jsonlContent: string): KnowledgeGraph {
    const graph: KnowledgeGraph = { entities: [], relations: [] };

    for (const line of jsonlContent.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const { type, ...rest } = JSON.parse(trimmed);
        if (type === "entity") {
          graph.entities.push({
            ...(rest as Entity),
            observations: normalizeObservations((rest as Entity).observations),
          });
        } else if (type === "relation") {
          graph.relations.push(rest as Relation);
        }
      } catch {
        // skip a malformed / truncated line — the prior graph is a retrieval nicety
      }
    }

    return graph;
  }
}
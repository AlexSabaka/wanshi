import { KnowledgeGraph, Entity, Relation } from "../../../types/KnowledgeGraph";
import { ProcessingOptions } from "../../../types/ProcessingOptions";
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

  // /**
  //  * Parse JSONL content back to KnowledgeGraph
  //  */
  // static fromJSONL(jsonlContent: string): KnowledgeGraph {
  //   const lines = jsonlContent.split("\n").filter((line) => line.trim() !== "");
  //   const graph: KnowledgeGraph = { entities: [], relations: [] };

  //   lines.forEach((line) => {
  //     try {
  //       const item = JSON.parse(line);
  //       if (item.type === "entity") {
  //         const { type, ...entity } = item;
  //         graph.entities.push(entity as Entity);
  //       } else if (item.type === "relation") {
  //         const { type, ...relation } = item;
  //         graph.relations.push(relation as Relation);
  //       }
  //     } catch (error) {
  //       logger.warn(`Failed to parse JSONL line: ${line}`);
  //     }
  //   });

  //   return graph;
  // }
}
import { KnowledgeGraph } from "../../../types/KnowledgeGraph";
import { ProcessingOptions } from "../../../types/ProcessingOptions";
import { IExportStrategy } from "./IExportStrategy";

/**
 * Strategy for exporting Knowledge Graphs to JSON format
 */
export class JsonExportStrategy implements IExportStrategy {
  export(graph: KnowledgeGraph, processingOptions?: ProcessingOptions): string {
    return JSON.stringify(graph, null, 2);
  }

  getFormat(): string {
    return "json";
  }

  supportsFormat(format: string): boolean {
    return format === "json";
  }
}
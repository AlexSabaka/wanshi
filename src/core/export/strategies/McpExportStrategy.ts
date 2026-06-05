import { KnowledgeGraph, Entity, Relation } from "../../../types/KnowledgeGraph";
import { obsText, normalizeObservations } from "../../../types/Observation";
import { MCPKnowledgeGraph } from "../../../types/MCPKnowledgeGraph";
import { ProcessingOptions } from "../../../types/ProcessingOptions";
import { IExportStrategy } from "./IExportStrategy";

/**
 * Strategy for handling MCP (Model Context Protocol) format conversions and exports
 */
export class McpExportStrategy implements IExportStrategy {
  export(graph: KnowledgeGraph, processingOptions?: ProcessingOptions): string {
    const mcpGraph = this.toMCP(graph);
    const lines: string[] = [];

    mcpGraph.entities.forEach((entity) => {
      lines.push(JSON.stringify({ type: "entity", ...entity }));
    });

    mcpGraph.relations.forEach((relation) => {
      lines.push(JSON.stringify({ type: "relation", ...relation }));
    });

    return lines.join("\n");
  }

  getFormat(): string {
    return "mcp-jsonl";
  }

  supportsFormat(format: string): boolean {
    return format === "mcp-jsonl";
  }

  /**
   * Convert our KnowledgeGraph format to MCP format
   */
  toMCP(graph: KnowledgeGraph): MCPKnowledgeGraph {
    return {
      entities: graph.entities.map((entity) => ({
        name: entity.name,
        entityType: entity.entityType,
        // MCP memory server stores observations as bare strings.
        observations: (entity.observations || []).map(obsText),
      })),
      relations: graph.relations.map((relation) => ({
        from: relation.from,
        to: relation.to,
        relationType: Array.isArray(relation.relationType)
          ? relation.relationType.join(",")
          : relation.relationType,
      })),
    };
  }

  /**
   * Convert MCP format to our KnowledgeGraph format
   */
  static fromMCP(mcpGraph: MCPKnowledgeGraph): KnowledgeGraph {
    return {
      entities: mcpGraph.entities.map(
        (entity) =>
          ({
            name: entity.name,
            entityType: entity.entityType,
            observations: normalizeObservations(entity.observations || []),
          } as Entity)
      ),
      relations: mcpGraph.relations.map(
        (relation) =>
          ({
            from: relation.from,
            to: relation.to,
            relationType: relation.relationType.includes(",")
              ? relation.relationType.split(",").map((s) => s.trim())
              : relation.relationType,
          } as Relation)
      ),
    };
  }
}
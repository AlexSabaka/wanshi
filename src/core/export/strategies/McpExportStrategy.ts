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
      relations: graph.relations.map((relation) => {
        const mcp: MCPKnowledgeGraph["relations"][number] = {
          from: relation.from,
          to: relation.to,
          relationType: Array.isArray(relation.relationType)
            ? relation.relationType.join(",")
            : relation.relationType,
        };
        // Carry reference/faithfulness provenance as edge properties when present
        // (WS-36). Only set when defined so plain LLM edges are byte-identical.
        if (relation.resolved !== undefined) mcp.resolved = relation.resolved;
        if (relation.faithfulness !== undefined) mcp.faithfulness = relation.faithfulness;
        if (relation.faithfulnessScore !== undefined)
          mcp.faithfulnessScore = relation.faithfulnessScore;
        if (relation.supportingSpan !== undefined) mcp.supportingSpan = relation.supportingSpan;
        return mcp;
      }),
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
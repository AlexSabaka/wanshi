// MCP-compatible interfaces
export interface MCPEntity {
  name: string;
  entityType: string;
  observations: string[];
}

export interface MCPRelation {
  from: string;
  to: string;
  relationType: string;
  // Reference-resolution + citation-faithfulness provenance (WS-36): the merger
  // preserves these on Relation, so the MCP exporter carries them as edge
  // properties rather than dropping them. All optional ⇒ ordinary LLM-extracted
  // edges (which lack them) serialize byte-identically. The MCP memory server
  // reads only from/to/relationType, so unknown keys are ignored downstream.
  resolved?: boolean;
  faithfulness?: "supported" | "unsupported" | "uncertain";
  faithfulnessScore?: number;
  supportingSpan?: string;
}

export interface MCPKnowledgeGraph {
  entities: MCPEntity[];
  relations: MCPRelation[];
}

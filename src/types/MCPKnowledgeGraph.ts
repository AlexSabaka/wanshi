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
}

export interface MCPKnowledgeGraph {
  entities: MCPEntity[];
  relations: MCPRelation[];
}

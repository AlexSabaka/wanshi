import { Logger } from "./Logger";

export interface MergeOptions {
  entitySimilarityThreshold: number; // 0-1, similarity threshold for entity name matching
  observationSimilarityThreshold: number; // 0-1, similarity threshold for observation deduplication
  model: string; // Ollama model for embeddings
  host: string; // Ollama host
  logger?: Logger;
}

export interface Entity {
  name: string;
  files: string[];
  chunk: number;
  totalChunks: number;
  entityType: string;
  observations: string[];
}

export interface Relation {
  from: string;
  to: string;
  relationType: string[];
}

export interface KnowledgeGraph {
  entities: Entity[];
  relations: Relation[];
}

export interface ProcessingOptions {
  input: string;
  filter: string;
  output: string;
  model: string;
  chunkSize?: number;
  overlapSize?: number;
  enableChunking?: boolean;
  embeddingsModel: string;
  entitySimilarityThreshold?: number;
  observationSimilarityThreshold?: number;
  enableSimilarityMerging?: boolean;
  exportFormat?: 'json' | 'jsonl' | 'mcp-jsonl';
  system: string;
  host: string;
  logLevel: 'debug' | 'info' | 'warning' | 'error';
  logFile: string;
  watch: boolean;
  debug: boolean;
  silent: boolean;
}



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

// Conversion utilities
export class KnowledgeGraphConverter {
  // Convert our format to MCP format
  static toMCP(graph: KnowledgeGraph): MCPKnowledgeGraph {
    return {
      entities: graph.entities.map(entity => ({
        name: entity.name,
        entityType: entity.entityType,
        observations: entity.observations || []
      })),
      relations: graph.relations.map(relation => ({
        from: relation.from,
        to: relation.to,
        relationType: Array.isArray(relation.relationType) 
          ? relation.relationType.join(",") 
          : relation.relationType
      }))
    };
  }

  // Convert MCP format to our format
  static fromMCP(mcpGraph: MCPKnowledgeGraph): KnowledgeGraph {
    return {
      entities: mcpGraph.entities.map(entity => ({
        name: entity.name,
        entityType: entity.entityType,
        observations: entity.observations || []
      } as Entity)),
      relations: mcpGraph.relations.map(relation => ({
        from: relation.from,
        to: relation.to,
        relationType: relation.relationType.includes(",") 
          ? relation.relationType.split(",").map(s => s.trim())
          : relation.relationType
      } as Relation))
    };
  }

  // Export to JSONL format (each line is a JSON object)
  static toJSONL(graph: KnowledgeGraph): string {
    const lines: string[] = [];
    
    // Add entities as JSONL
    graph.entities.forEach(entity => {
      lines.push(JSON.stringify({ type: "entity", ...entity }));
    });
    
    // Add relations as JSONL
    graph.relations.forEach(relation => {
      lines.push(JSON.stringify({ type: "relation", ...relation }));
    });
    
    return lines.join('\n');
  }

  // Import from JSONL format
  static fromJSONL(jsonlContent: string): KnowledgeGraph {
    const lines = jsonlContent.split('\n').filter(line => line.trim() !== '');
    const graph: KnowledgeGraph = { entities: [], relations: [] };
    
    lines.forEach(line => {
      try {
        const item = JSON.parse(line);
        if (item.type === 'entity') {
          const { type, ...entity } = item;
          graph.entities.push(entity as Entity);
        } else if (item.type === 'relation') {
          const { type, ...relation } = item;
          graph.relations.push(relation as Relation);
        }
      } catch (error) {
        console.warn(`Failed to parse JSONL line: ${line}`);
      }
    });
    
    return graph;
  }

  // Export to MCP JSONL format
  static toMCPJSONL(graph: KnowledgeGraph): string {
    const mcpGraph = this.toMCP(graph);
    const lines: string[] = [];
    
    mcpGraph.entities.forEach(entity => {
      lines.push(JSON.stringify({ type: "entity", ...entity }));
    });
    
    mcpGraph.relations.forEach(relation => {
      lines.push(JSON.stringify({ type: "relation", ...relation }));
    });
    
    return lines.join('\n');
  }
}
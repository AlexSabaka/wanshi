import { Observation } from "./Observation";

export interface Entity {
  name: string;
  files: string[];
  chunk?: number;
  totalChunks?: number;
  entityType: string;
  observations: Observation[];
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

import path from "path";
import { EmbeddingService } from "../../llm/";
import { cosineSimilarity, jaroWinklerSimilarity } from "../../../shared/utils";
import { IKnowledgeGraphSearch, Entity, KnowledgeGraph, Relation } from "../../../types";
import { Logger } from "../../../shared";

// Enhanced search with multiple strategies
export class KnowledgeGraphSearch implements IKnowledgeGraphSearch {
 
  constructor(
    private embeddingService: EmbeddingService,
    private logger: Logger,
  ) {
  }

  // Strategy 1: Content-based search using file content directly
  async searchByFileContent(
    fileContent: string,
    fileName: string,
    graphs: KnowledgeGraph[],
    options: {
      limit?: number;
      entityTypes?: string[];
      includeObservations?: boolean;
    } = {}
  ): Promise<KnowledgeGraph> {
    this.logger.debug(`Searching knowledge graphs for context relevant to: ${fileName}`);
    
    // Extract key terms from file content (simple but effective)
    const keyTerms = this.extractKeyTerms(fileContent, fileName);
    
    // Multi-strategy search
    const results = await Promise.all([
      this.searchByKeyTerms(keyTerms, graphs, options),
      this.searchByFileRelationship(fileName, graphs, options),
      this.searchByEmbeddings(fileContent, graphs, options)
    ]);
    
    // Merge and rank results
    return this.mergeSearchResults(results, options.limit || 10);
  }

  // Strategy 2: Extract meaningful terms without LLM
  private extractKeyTerms(content: string, fileName: string): string[] {
    const terms = new Set<string>();
    
    // Add filename-based terms
    const fileBaseName = path.basename(fileName, path.extname(fileName));
    terms.add(fileBaseName);
    
    // Extract programming language keywords
    const codeTerms = this.extractCodeTerms(content);
    codeTerms.forEach(term => terms.add(term));
    
    // Extract camelCase/snake_case identifiers
    const identifiers = content.match(/[a-zA-Z_][a-zA-Z0-9_]*[A-Z][a-zA-Z0-9_]*/g) || [];
    identifiers.slice(0, 20).forEach(term => terms.add(term)); // Limit to prevent noise
    
    // Extract quoted strings (might be important concepts)
    const quotes = content.match(/"([^"]+)"|'([^']+)'/g) || [];
    quotes.slice(0, 10).forEach(quote => {
      const cleaned = quote.replace(/['"]/g, '');
      if (cleaned.length > 3 && cleaned.length < 30) {
        terms.add(cleaned);
      }
    });
    
    // Extract URLs/imports
    const imports = content.match(/(?:import|from|require)\s+["']([^"']+)["']/g) || [];
    imports.forEach(imp => {
      const module = imp.match(/["']([^"']+)["']/)?.[1];
      if (module) terms.add(module);
    });
    
    return Array.from(terms);
  }

  private extractCodeTerms(content: string): string[] {
    const terms: string[] = [];
    
    // Function/class names
    const functions = content.match(/(?:function|class|def|fn)\s+([a-zA-Z_][a-zA-Z0-9_]*)/g) || [];
    functions.forEach(match => {
      const name = match.split(/\s+/).pop();
      if (name) terms.push(name);
    });
    
    // Variable declarations
    const variables = content.match(/(?:const|let|var|final)\s+([a-zA-Z_][a-zA-Z0-9_]*)/g) || [];
    variables.forEach(match => {
      const name = match.split(/\s+/).pop();
      if (name) terms.push(name);
    });
    
    return terms;
  }

  // Strategy 3: Search by extracted key terms
  private async searchByKeyTerms(
    keyTerms: string[],
    graphs: KnowledgeGraph[],
    options: any
  ): Promise<KnowledgeGraph> {
    const allEntities: (Entity & { relevanceScore: number })[] = [];
    const allRelations: Relation[] = [];
    const entityNames = new Set<string>();
    
    for (const graph of graphs) {
      for (const entity of graph.entities) {
        let relevanceScore = 0;
        
        // Check entity name against key terms
        for (const term of keyTerms) {
          if (jaroWinklerSimilarity(entity.name, term) > 0.7) {
            relevanceScore += 1;
          }
          if (entity.name.toLowerCase().includes(term.toLowerCase())) {
            relevanceScore += 0.5;
          }
        }
        
        // Check entity type
        for (const term of keyTerms) {
          if (jaroWinklerSimilarity(entity.entityType, term) > 0.7) {
            relevanceScore += 0.8;
          }
        }
        
        // Check observations if enabled
        if (options.includeObservations !== false) {
          for (const obs of entity.observations || []) {
            for (const term of keyTerms) {
              if (obs.toLowerCase().includes(term.toLowerCase())) {
                relevanceScore += 0.3;
              }
            }
          }
        }
        
        if (relevanceScore > 0.5) {
          allEntities.push({ ...entity, relevanceScore });
          entityNames.add(entity.name);
        }
      }
      
      // Add relations between relevant entities
      for (const relation of graph.relations) {
        if (entityNames.has(relation.from) && entityNames.has(relation.to)) {
          allRelations.push(relation);
        }
      }
    }
    
    // Sort by relevance and limit
    allEntities.sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0));
    
    return {
      entities: allEntities.slice(0, options.limit || 10),
      relations: allRelations
    };
  }

  // Strategy 4: Search by file relationship
  private async searchByFileRelationship(
    fileName: string,
    graphs: KnowledgeGraph[],
    options: any
  ): Promise<KnowledgeGraph> {
    const fileBaseName = path.basename(fileName, path.extname(fileName));
    const fileDirName = path.dirname(fileName);
    
    const relatedEntities: Entity[] = [];
    const relatedRelations: Relation[] = [];
    const entityNames = new Set<string>();
    
    for (const graph of graphs) {
      for (const entity of graph.entities) {
        let isRelated = false;
        
        // Same file
        if (entity.files[0] === fileName) {
          isRelated = true;
        }
        
        // Same directory
        if (entity.files[0] && path.dirname(entity.files[0]) === fileDirName) {
          isRelated = true;
        }
        
        // Similar file name
        if (entity.files[0] && jaroWinklerSimilarity(
          path.basename(entity.files[0], path.extname(entity.files[0])), 
          fileBaseName
        ) > 0.6) {
          isRelated = true;
        }
        
        if (isRelated) {
          relatedEntities.push(entity);
          entityNames.add(entity.name);
        }
      }
      
      // Add relations between related entities
      for (const relation of graph.relations) {
        if (entityNames.has(relation.from) && entityNames.has(relation.to)) {
          relatedRelations.push(relation);
        }
      }
    }
    
    return {
      entities: relatedEntities.slice(0, options.limit || 5),
      relations: relatedRelations
    };
  }

  // Strategy 5: Embedding-based search (optional, with caching)
  private async searchByEmbeddings(
    content: string,
    graphs: KnowledgeGraph[],
    options: any
  ): Promise<KnowledgeGraph> {
    try {
      // Create embedding for file content (truncate if too long)
      const truncatedContent = content.slice(0, 2000); // Prevent context overflow
      const contentEmbedding = await this.embeddingService.embed(truncatedContent);
      
      const scoredEntities: Array<Entity & { similarityScore: number }> = [];
      
      for (const graph of graphs) {
        for (const entity of graph.entities) {
          // Create entity text for embedding
          const entityText = `${entity.name} ${entity.entityType} ${(entity.observations || []).join(' ')}`;
          const entityEmbedding = await this.embeddingService.embed(entityText);
          
          const similarity = cosineSimilarity(contentEmbedding, entityEmbedding);
          
          if (similarity > 0.3) { // Threshold for relevance
            scoredEntities.push({ ...entity, similarityScore: similarity });
          }
        }
      }
      
      // Sort by similarity and take top results
      scoredEntities.sort((a, b) => b.similarityScore - a.similarityScore);
      const topEntities = scoredEntities.slice(0, options.limit || 5);
      
      const entityNames = new Set(topEntities.map(e => e.name));
      const relatedRelations: Relation[] = [];
      
      for (const graph of graphs) {
        for (const relation of graph.relations) {
          if (entityNames.has(relation.from) && entityNames.has(relation.to)) {
            relatedRelations.push(relation);
          }
        }
      }
      
      return {
        entities: topEntities,
        relations: relatedRelations
      };
      
    } catch (error) {
      this.logger.warn(`Embedding search failed: ${error}`);
      return { entities: [], relations: [] };
    }
  }

  // Merge and deduplicate results from multiple strategies
  private mergeSearchResults(results: KnowledgeGraph[], limit: number): KnowledgeGraph {
    const entityMap = new Map<string, Entity>();
    const relationSet = new Set<string>();
    const relations: Relation[] = [];
    
    // Merge entities, preferring higher relevance scores
    for (const result of results) {
      for (const entity of result.entities) {
        const existing = entityMap.get(entity.name);
        if (!existing || ((entity as any).relevanceScore || 0) > ((existing as any).relevanceScore || 0)) {
          entityMap.set(entity.name, entity);
        }
      }
      
      // Merge relations
      for (const relation of result.relations) {
        const relationKey = `${relation.from}->${relation.to}:${JSON.stringify(relation.relationType)}`;
        if (!relationSet.has(relationKey)) {
          relationSet.add(relationKey);
          relations.push(relation);
        }
      }
    }
    
    // Sort entities by relevance and limit
    const sortedEntities = Array.from(entityMap.values())
      .sort((a, b) => ((b as any).relevanceScore || 0) - ((a as any).relevanceScore || 0))
      .slice(0, limit);
    
    const finalEntityNames = new Set(sortedEntities.map(e => e.name));
    const finalRelations = relations.filter(r => 
      finalEntityNames.has(r.from) && finalEntityNames.has(r.to)
    );
    
    return {
      entities: sortedEntities,
      relations: finalRelations
    };
  }
}

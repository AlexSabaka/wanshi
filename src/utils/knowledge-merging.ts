import { MergeOptions } from "../types/MergeOptions";
import { KnowledgeGraph, Entity, Relation } from "../types/KnowledgeGraph";
import { logger } from "./../Logger";

import { jaroWinklerSimilarity } from "./jaroWinklerSimilarity";
import { cosineSimilarity } from "./cosineSimilarity";
import { getEmbedding } from "./getEmbeddings";

// Deduplicate observations using embeddings
async function deduplicateObservations(
  observations: string[],
  threshold: number,
  model: string,
  host: string
): Promise<string[]> {
  if (observations.length <= 1) return observations;

  logger?.debug(`Deduplicating ${observations.length} observations`);

  // Get embeddings for all observations
  const observationData: Array<{ text: string; embedding: number[] }> = [];

  for (const obs of observations) {
    try {
      const embedding = await getEmbedding(obs, model, host);
      observationData.push({ text: obs, embedding });
    } catch (error) {
      logger?.warn(`Failed to get embedding for observation: ${obs}`);
      // Keep observation even if embedding fails
      observationData.push({ text: obs, embedding: [] });
    }
  }

  // Find duplicates using cosine similarity
  const toRemove = new Set<number>();

  for (let i = 0; i < observationData.length; i++) {
    if (toRemove.has(i) || observationData[i].embedding.length === 0) continue;

    for (let j = i + 1; j < observationData.length; j++) {
      if (toRemove.has(j) || observationData[j].embedding.length === 0)
        continue;

      const similarity = cosineSimilarity(
        observationData[i].embedding,
        observationData[j].embedding
      );

      if (similarity >= threshold) {
        // Keep the longer/more detailed observation
        if (observationData[i].text.length >= observationData[j].text.length) {
          toRemove.add(j);
        } else {
          toRemove.add(i);
          break; // Exit inner loop since we're removing current observation
        }
      }
    }
  }

  const deduplicated = observationData
    .filter((_, index) => !toRemove.has(index))
    .map((item) => item.text);

  logger?.debug(
    `Deduplicated to ${deduplicated.length} observations (removed ${
      observations.length - deduplicated.length
    })`
  );

  return deduplicated;
}

// Find similar entity by name
function findSimilarEntity(
  entityName: string,
  existingEntities: Map<string, Entity>,
  threshold: number
): string | null {
  let bestMatch: string | null = null;
  let bestSimilarity = 0;

  for (const existingName of existingEntities.keys()) {
    const similarity = jaroWinklerSimilarity(entityName, existingName);
    if (similarity >= threshold && similarity > bestSimilarity) {
      bestSimilarity = similarity;
      bestMatch = existingName;
    }
  }

  return bestMatch;
}

export async function mergeKnowledgeGraphs(
  graphs: KnowledgeGraph[],
  options: MergeOptions
): Promise<KnowledgeGraph> {
  logger?.info(
    `Starting hierarchical merge of ${graphs.length} knowledge graphs`
  );
  logger?.info(
    `Entity similarity threshold: ${options.entitySimilarityThreshold}`
  );
  logger?.info(
    `Observation similarity threshold: ${options.observationSimilarityThreshold}`
  );

  // Step 1: Group graphs by file
  const graphsByFile = new Map<string, KnowledgeGraph[]>();

  for (const graph of graphs) {
    for (const entity of graph.entities) {
      const file = entity.files[0] || "unknown";
      if (!graphsByFile.has(file)) {
        graphsByFile.set(file, []);
      }

      // Create a mini-graph for this entity and related relations
      const entityGraph: KnowledgeGraph = {
        entities: [entity],
        relations: graph.relations.filter(
          (r) => r.from === entity.name || r.to === entity.name
        ),
      };

      graphsByFile.get(file)!.push(entityGraph);
    }
  }

  logger?.info(`Step 1: Grouped into ${graphsByFile.size} files`);

  // Step 2: Merge entities within each file
  const mergedByFile = new Map<string, KnowledgeGraph>();

  for (const [file, fileGraphs] of graphsByFile) {
    logger?.debug(
      `Step 2: Merging ${fileGraphs.length} entities in file: ${file}`
    );

    const fileMerged = await mergeWithinFile(fileGraphs, file, options);
    mergedByFile.set(file, fileMerged);

    logger?.debug(
      `File ${file}: ${fileMerged.entities.length} entities, ${fileMerged.relations.length} relations`
    );
  }

  // Step 3: Global merge across files
  logger?.info(
    `Step 3: Global merge across ${mergedByFile.size} files`
  );

  const globalGraphs = Array.from(mergedByFile.values());
  const finalResult = await mergeGlobally(globalGraphs, options);

  logger?.info(
    `Hierarchical merge complete: ${finalResult.entities.length} entities, ${finalResult.relations.length} relations`
  );

  return finalResult;
}

// Merge entities within a single file using stricter similarity
async function mergeWithinFile(
  fileGraphs: KnowledgeGraph[],
  fileName: string,
  options: MergeOptions
): Promise<KnowledgeGraph> {
  const entityMap = new Map<string, Entity>();
  const relationSet = new Set<string>();
  const relations: Relation[] = [];

  // Use stricter similarity threshold for same-file merging (entities are more likely to be related)
  const withinFileSimilarityThreshold = Math.min(
    options.entitySimilarityThreshold * 0.7,
    0.6
  );

  logger?.debug(
    `Within-file similarity threshold for ${fileName}: ${withinFileSimilarityThreshold}`
  );

  // Merge entities within the file
  for (const graph of fileGraphs) {
    for (const entity of graph.entities) {
      const similarEntityName = findSimilarEntity(
        entity.name,
        entityMap,
        withinFileSimilarityThreshold
      );

      if (similarEntityName) {
        // Merge with existing similar entity
        const existing = entityMap.get(similarEntityName)!;
        logger?.debug(
          `[${fileName}] Merging entity "${entity.name}" with existing "${similarEntityName}"`
        );

        // Combine observations
        const allObservations = [
          ...(existing.observations || []),
          ...(entity.observations || []),
        ];

        // Deduplicate observations using embeddings (more aggressive within file)
        if (allObservations.length > 0) {
          existing.observations = await deduplicateObservations(
            allObservations,
            Math.min(options.observationSimilarityThreshold * 0.8, 0.7), // More aggressive deduplication
            options.model,
            options.host
          );
        }

        // Merge other properties
        existing.entityType = existing.entityType || entity.entityType;

        // Merge chunk information (keep the range)
        if (entity.chunk !== undefined) {
          existing.chunk =
            existing.chunk !== undefined
              ? Math.min(existing.chunk, entity.chunk)
              : entity.chunk;
        }
        if (entity.totalChunks !== undefined) {
          existing.totalChunks = Math.max(
            existing.totalChunks || 0,
            entity.totalChunks
          );
        }
      } else {
        // Add as new entity
        const newEntity = { ...entity, file: fileName };
        entityMap.set(entity.name, newEntity);
      }
    }
  }

  // Merge relations within the file
  for (const graph of fileGraphs) {
    for (const relation of graph.relations) {
      // Map relation entity names to merged names
      const fromEntity =
        findSimilarEntity(
          relation.from,
          entityMap,
          withinFileSimilarityThreshold
        ) || relation.from;
      const toEntity =
        findSimilarEntity(
          relation.to,
          entityMap,
          withinFileSimilarityThreshold
        ) || relation.to;

      // Only keep relations where both entities exist in the file's merged graph
      if (entityMap.has(fromEntity) && entityMap.has(toEntity)) {
        const relationKey = `${fromEntity}->${toEntity}:${JSON.stringify(
          relation.relationType
        )}`;
        if (!relationSet.has(relationKey)) {
          relationSet.add(relationKey);
          relations.push({
            from: fromEntity,
            to: toEntity,
            relationType: relation.relationType,
          });
        }
      }
    }
  }

  return {
    entities: Array.from(entityMap.values()),
    relations: relations,
  };
}

// Global merge across different files using more relaxed similarity
async function mergeGlobally(
  fileGraphs: KnowledgeGraph[],
  options: MergeOptions
): Promise<KnowledgeGraph> {
  const entityMap = new Map<string, Entity>();
  const relationSet = new Set<string>();
  const relations: Relation[] = [];

  // Track which files each entity appears in
  const entityFileMap = new Map<string, Set<string>>();

  // Use the original similarity threshold for cross-file merging
  const globalSimilarityThreshold = options.entitySimilarityThreshold;

  logger?.debug(
    `Global similarity threshold: ${globalSimilarityThreshold}`
  );

  // Merge entities across files
  for (const graph of fileGraphs) {
    for (const entity of graph.entities) {
      const similarEntityName = findSimilarEntity(
        entity.name,
        entityMap,
        globalSimilarityThreshold
      );

      if (similarEntityName) {
        // Merge with existing similar entity from different file
        const existing = entityMap.get(similarEntityName)!;
        logger?.debug(
          `[Global] Merging entity "${entity.name}" (${entity.files[0]}) with existing "${similarEntityName}" (${existing.files[0]})`
        );

        // Combine observations (more conservative deduplication across files)
        const allObservations = [
          ...(existing.observations || []),
          ...(entity.observations || []),
        ];

        if (allObservations.length > 0) {
          existing.observations = await deduplicateObservations(
            allObservations,
            options.observationSimilarityThreshold, // Use original threshold
            options.model,
            options.host
          );
        }

        // Merge entity types (prefer more specific one)
        if (
          entity.entityType &&
          entity.entityType.length > existing.entityType.length
        ) {
          existing.entityType = entity.entityType;
        }

        // Track files this entity appears in
        if (!entityFileMap.has(similarEntityName)) {
          entityFileMap.set(
            similarEntityName,
            new Set([existing.files[0] || "unknown"])
          );
        }
        entityFileMap.get(similarEntityName)!.add(entity.files[0] || "unknown");

        // Update file information to include multiple files
        const files = Array.from(entityFileMap.get(similarEntityName)!);
        existing.files[0] = files.length === 1 ? files[0] : files.join(",");

        // Merge chunk information (keep ranges)
        if (entity.chunk !== undefined) {
          existing.chunk =
            existing.chunk !== undefined
              ? Math.min(existing.chunk, entity.chunk)
              : entity.chunk;
        }
        if (entity.totalChunks !== undefined) {
          existing.totalChunks = Math.max(
            existing.totalChunks || 0,
            entity.totalChunks
          );
        }
      } else {
        // Add as new entity
        entityMap.set(entity.name, { ...entity });
        entityFileMap.set(entity.name, new Set([entity.files[0] || "unknown"]));
      }
    }
  }

  // Merge relations across files
  for (const graph of fileGraphs) {
    for (const relation of graph.relations) {
      // Map relation entity names to merged names
      const fromEntity =
        findSimilarEntity(
          relation.from,
          entityMap,
          globalSimilarityThreshold
        ) || relation.from;
      const toEntity =
        findSimilarEntity(relation.to, entityMap, globalSimilarityThreshold) ||
        relation.to;

      // Only keep relations where both entities exist in final graph
      if (entityMap.has(fromEntity) && entityMap.has(toEntity)) {
        const relationKey = `${fromEntity}->${toEntity}:${JSON.stringify(
          relation.relationType
        )}`;
        if (!relationSet.has(relationKey)) {
          relationSet.add(relationKey);
          relations.push({
            from: fromEntity,
            to: toEntity,
            relationType: relation.relationType,
          });
        }
      }
    }
  }

  // Log cross-file entity statistics
  const crossFileEntities = Array.from(entityFileMap.entries()).filter(
    ([_, files]) => files.size > 1
  );

  if (crossFileEntities.length > 0) {
    logger?.info(
      `Found ${crossFileEntities.length} entities appearing across multiple files:`
    );
    crossFileEntities.forEach(([entityName, files]) => {
      logger?.debug(`  ${entityName}: ${Array.from(files).join(", ")}`);
    });
  }

  return {
    entities: Array.from(entityMap.values()),
    relations: relations,
  };
}

// Very basic search function
export function searchKnowledgeGraphsNodes(
  query: string,
  graphs: KnowledgeGraph[],
  similarityThreshold: number = 0.7,
  limit: number = 5
): KnowledgeGraph {
  const filteredGraph = graphs.reduce(
    (acc, graph) => {
      // Filter entities
      const filteredEntities = graph.entities.filter(
        (e) =>
          jaroWinklerSimilarity(e.name, query) > similarityThreshold ||
          jaroWinklerSimilarity(e.entityType, query) > similarityThreshold ||
          e.observations.some(
            (o) => jaroWinklerSimilarity(o, query) > similarityThreshold
          )
      );

      // Create a Set of filtered entity names for quick lookup
      const filteredEntityNames = new Set([
        ...filteredEntities.map((e) => e.name),
        ...acc.entities.map((e) => e.name)
      ]);

      // Filter relations to only include those between filtered entities
      const filteredRelations = [ ...graph.relations, ...acc.relations ].filter(
        (r) => filteredEntityNames.has(r.from) && filteredEntityNames.has(r.to)
      );

      return { entities: filteredEntities, relations: filteredRelations };
    },
    { entities: [], relations: [] } as KnowledgeGraph
  );

  const filteredEntities = filteredGraph.entities.slice(0, limit);
  const filteredEntityNames = new Set(filteredEntities.map((e) => e.name));
  const filteredRelations = filteredGraph.relations.filter(
    (r) => filteredEntityNames.has(r.from) && filteredEntityNames.has(r.to)
  );

  return {
    entities: filteredEntities,
    relations: filteredRelations
  }
}

import { Digraph, Node, Edge, Subgraph, attribute, toDot } from 'ts-graphviz';
import { KnowledgeGraph } from "../../../types/KnowledgeGraph";
import { obsText } from "../../../types/Observation";
import { ProcessingOptions } from "../../../types/ProcessingOptions";
import { IExportStrategy } from "./IExportStrategy";

/**
 * Strategy for exporting Knowledge Graphs to Graphviz DOT format using ts-graphviz
 * Much cleaner than manual string concatenation hell
 */
export class GraphvizDotExportStrategy implements IExportStrategy {
  export(
    graph: KnowledgeGraph, 
    processingOptions?: ProcessingOptions
  ): string {
    return this.exportWithOptions(graph, processingOptions);
  }

  /**
   * Export with specific DOT options using ts-graphviz API
   */
  exportWithOptions(
    graph: KnowledgeGraph, 
    processingOptions?: ProcessingOptions,
  ): string {
    const {
      layout = "dot",
      rankdir = "TB",
      nodeShape = "box",
      edgeStyle = "solid",
      colorScheme = "default",
      includeObservations = true,
      maxObservationsPerNode = 3,
      clusterByEntityType = false,
      clusterByFile = false,
      showLegend = true
    } = processingOptions?.export?.dot ?? {};

    // Create the main digraph
    const graphTitle = processingOptions
      ? `Knowledge Graph - ${processingOptions.input} (${processingOptions.llm.model})`
      : "Knowledge Graph";

    const digraph = new Digraph('KnowledgeGraph', {
      [attribute.label]: graphTitle,
      [attribute.labelloc]: 't',
      [attribute.fontsize]: 16,
      [attribute.fontname]: 'Arial Bold',
      [attribute.layout]: layout,
      [attribute.rankdir]: rankdir,
      [attribute.overlap]: false,
      [attribute.splines]: true
    });

    // Set default node and edge attributes
    digraph.node({
      [attribute.shape]: nodeShape,
      [attribute.style]: 'filled'
    });

    digraph.edge({
      // @ts-expect-error
     [attribute.style]: edgeStyle
    });

    const colors = this.getColorScheme(colorScheme);
    
    // Generate entity type to color mapping
    const entityTypes = [...new Set(graph.entities.map(e => e.entityType))];
    const typeColorMap = new Map<string, string>();
    entityTypes.forEach((type, index) => {
      typeColorMap.set(type, colors.entityColors[index % colors.entityColors.length]);
    });

    // Handle clustering by entity type
    if (clusterByEntityType && !clusterByFile) {
      this.addEntityTypeClusters(digraph, graph, entityTypes, colors, typeColorMap);
    }

    // Handle clustering by file
    if (clusterByFile) {
      this.addFileClusters(digraph, graph, colors);
    }

    // Add entity nodes
    this.addEntityNodes(digraph, graph, typeColorMap, colors, {
      includeObservations,
      maxObservationsPerNode,
      clusterByFile
    });

    // Add relation edges
    this.addRelationEdges(digraph, graph, colors);

    // Add processing configuration if available
    if (processingOptions) {
      this.addProcessingConfiguration(digraph, processingOptions);
    }

    // Add legend if enabled
    if (showLegend) {
      this.addLegend(digraph, entityTypes, typeColorMap, graph, colors);
    }

    return toDot(digraph);
  }

  getFormat(): string {
    return "dot";
  }

  supportsFormat(format: string): boolean {
    return format === "dot";
  }

  private addEntityTypeClusters(
    digraph: Digraph, 
    graph: KnowledgeGraph, 
    entityTypes: string[], 
    colors: any, 
    typeColorMap: Map<string, string>
  ): void {
    entityTypes.forEach((entityType, index) => {
      const entitiesOfType = graph.entities.filter(e => e.entityType === entityType);
      
      if (entitiesOfType.length > 1) {
        const cluster = new Subgraph(`cluster_${this.sanitizeId(entityType)}`, {
          [attribute.label]: entityType,
          [attribute.style]: 'dashed',
          [attribute.color]: colors.clusterColors[index % colors.clusterColors.length]
        });

        // Add entity nodes to cluster (will be created later)
        entitiesOfType.forEach(entity => {
          cluster.createNode(this.sanitizeId(entity.name));
        });

        digraph.addSubgraph(cluster);
      }
    });
  }

  private addFileClusters(digraph: Digraph, graph: KnowledgeGraph, colors: any): void {
    const fileGroups = new Map<string, typeof graph.entities>();
    
    graph.entities.forEach(entity => {
      const file = entity.files[0];
      if (file) {
        if (!fileGroups.has(file)) {
          fileGroups.set(file, []);
        }
        fileGroups.get(file)!.push(entity);
      }
    });

    let clusterIndex = 0;
    fileGroups.forEach((entities, file) => {
      if (entities.length > 1) {
        const cluster = new Subgraph(`cluster_file_${clusterIndex}`, {
          [attribute.label]: file,
          [attribute.style]: 'dashed',
          [attribute.color]: colors.fileColors[0]
        });

        entities.forEach(entity => {
          cluster.createNode(this.sanitizeId(entity.name));
        });

        digraph.addSubgraph(cluster);
        clusterIndex++;
      }
    });
  }

  private addEntityNodes(
    digraph: Digraph, 
    graph: KnowledgeGraph, 
    typeColorMap: Map<string, string>, 
    colors: any,
    options: {
      includeObservations: boolean;
      maxObservationsPerNode: number;
      clusterByFile: boolean;
    }
  ): void {
    graph.entities.forEach(entity => {
      const nodeId = this.sanitizeId(entity.name);
      const color = typeColorMap.get(entity.entityType) || colors.defaultColor;

      // Build node label
      let label = entity.name;

      // Add observations if enabled
      if (options.includeObservations && entity.observations?.length > 0) {
        const observations = entity.observations.slice(0, options.maxObservationsPerNode).map(obsText);
        const truncatedObs = observations.map(obs =>
          obs.length > 40 ? obs.substring(0, 37) + "..." : obs
        );

        label += "\n\n" + truncatedObs.map(obs => "• " + obs).join("\n");

        if (entity.observations.length > options.maxObservationsPerNode) {
          label += `\n... +${entity.observations.length - options.maxObservationsPerNode} more`;
        }
      }

      // Add entity type
      label += `\n\n[${entity.entityType}]`;

      // Add file info if not clustering by file
      if (entity.files[0] && !options.clusterByFile) {
        const fileName = entity.files[0].split("/").pop() || entity.files[0];
        label += `\n📁 ${fileName}`;
      }

      digraph.createNode(nodeId, {
        [attribute.label]: label,
        [attribute.fillcolor]: color,
        [attribute.tooltip]: entity.entityType
      });
    });
  }

  private addRelationEdges(digraph: Digraph, graph: KnowledgeGraph, colors: any): void {
    // Generate relation color mapping
    const uniqueRelationTypes = [
      ...new Set(
        graph.relations.flatMap(r =>
          Array.isArray(r.relationType) ? r.relationType : [r.relationType]
        )
      )
    ];

    const relationColorMap = new Map<string, string>();
    uniqueRelationTypes.forEach((relType, index) => {
      relationColorMap.set(
        relType,
        colors.relationColors[index % colors.relationColors.length]
      );
    });

    graph.relations.forEach(relation => {
      const fromId = this.sanitizeId(relation.from);
      const toId = this.sanitizeId(relation.to);

      const relationTypes = Array.isArray(relation.relationType)
        ? relation.relationType
        : [relation.relationType];

      relationTypes.forEach(relType => {
        const color = relationColorMap.get(relType) || colors.defaultRelationColor;
        
        digraph.createEdge([fromId, toId], {
          [attribute.label]: relType,
          [attribute.color]: color,
          [attribute.fontcolor]: color
        });
      });
    });
  }

  private addProcessingConfiguration(digraph: Digraph, processingOptions: ProcessingOptions): void {
    const configCluster = new Subgraph('cluster_processing', {
      [attribute.label]: 'Processing Configuration',
      [attribute.style]: 'solid',
      [attribute.color]: 'darkblue',
      [attribute.bgcolor]: 'lightcyan',
      [attribute.fontcolor]: 'darkblue'
    });

    const configInfo = [
      ["Input", processingOptions.input],
      ["Model", processingOptions.llm.model],
      ["Host", processingOptions.llm.host],
      ["Temperature", processingOptions.llm.temperature.toString()],
      ["Chunk Size", processingOptions.chunking.size.toString()],
      ["Overlap Size", processingOptions.chunking.overlap.toString()],
      ["Chunking", processingOptions.chunking.mode],
      ["Retrieval", processingOptions.retrieval.mode],
      ["ASR", processingOptions.readers.asr.mode],
      ...(processingOptions.readers.asr.whisperModel ? [["Whisper Model", processingOptions.readers.asr.whisperModel]] : []),
      ...(processingOptions.readers.asr.language ? [["Language", processingOptions.readers.asr.language]] : []),
      ...(processingOptions.export.format ? [["Export Format", processingOptions.export.format]] : []),
      ...(processingOptions.llm.seed !== undefined ? [["Seed", processingOptions.llm.seed.toString()]] : []),
    ];

    configInfo.forEach(([key, value], index) => {
      if (value) {
        const nodeId = `config_${index}`;
        const displayValue = value.length > 30 ? value.substring(0, 27) + "..." : value;
        const label = `${key}:\n${displayValue}`;
        
        configCluster.createNode(nodeId, {
          [attribute.label]: label,
          [attribute.shape]: 'note',
          [attribute.fillcolor]: 'lightyellow',
          [attribute.fontsize]: 10
        });
      }
    });

    digraph.addSubgraph(configCluster);
  }

  private addLegend(
    digraph: Digraph, 
    entityTypes: string[], 
    typeColorMap: Map<string, string>, 
    graph: KnowledgeGraph, 
    colors: any
  ): void {
    const legendCluster = new Subgraph('cluster_legend', {
      [attribute.label]: 'Legend',
      [attribute.style]: 'solid',
      [attribute.color]: 'black',
      [attribute.bgcolor]: 'lightgray'
    });

    // Add entity type legend nodes
    entityTypes.forEach((entityType, index) => {
      const color = typeColorMap.get(entityType) || colors.defaultColor;
      const nodeId = `legend_entity_${index}`;
      
      legendCluster.createNode(nodeId, {
        [attribute.label]: entityType,
        [attribute.shape]: 'box',
        [attribute.fillcolor]: color
      });
    });

    // Add relation type legend
    const uniqueRelationTypes = [
      ...new Set(
        graph.relations.flatMap(r =>
          Array.isArray(r.relationType) ? r.relationType : [r.relationType]
        )
      )
    ];

    if (uniqueRelationTypes.length > 0) {
      legendCluster.createNode('legend_rel_start', {
        [attribute.label]: 'Relations:',
        [attribute.shape]: 'plaintext'
      });

      // Limit to 10 relation types for readability
      uniqueRelationTypes.slice(0, 10).forEach((relType, index) => {
        const color = colors.relationColors[index % colors.relationColors.length];
        const fromId = `legend_rel_${index}_from`;
        const toId = `legend_rel_${index}_to`;
        
        legendCluster.createNode(fromId, {
          [attribute.label]: '',
          [attribute.shape]: 'point',
          [attribute.width]: 0.1
        });
        
        legendCluster.createNode(toId, {
          [attribute.label]: relType,
          [attribute.shape]: 'plaintext'
        });
        
        legendCluster.createEdge([fromId, toId], {
          [attribute.color]: color,
          [attribute.fontcolor]: color
        });
      });
    }

    digraph.addSubgraph(legendCluster);
  }

  private sanitizeId(id: string): string {
    // Replace invalid characters for DOT identifiers
    return id.replace(/[^a-zA-Z0-9_]/g, '_');
  }

  private getColorScheme(scheme: string) {
    switch (scheme) {
      case "scientific":
        return {
          entityColors: [
            "lightblue", "lightgreen", "lightyellow", "lightcoral",
            "lightpink", "lightgray", "lightsteelblue", "lightseagreen"
          ],
          relationColors: [
            "blue", "darkgreen", "orange", "red", "purple", "brown", "darkblue", "darkred"
          ],
          clusterColors: ["blue", "green", "red", "purple", "orange"],
          fileColors: ["gray"],
          defaultColor: "white",
          defaultRelationColor: "black",
        };

      case "code":
        return {
          entityColors: [
            "#FFE6CC", "#E6F3FF", "#E6FFE6", "#FFE6F3",
            "#F3E6FF", "#FFFFE6", "#E6FFFF", "#FFE6E6"
          ],
          relationColors: [
            "#FF6B35", "#004E89", "#4CAF50", "#E91E63",
            "#9C27B0", "#FF9800", "#00BCD4", "#F44336"
          ],
          clusterColors: ["#1976D2", "#388E3C", "#D32F2F", "#7B1FA2", "#F57C00"],
          fileColors: ["#616161"],
          defaultColor: "#F5F5F5",
          defaultRelationColor: "#424242",
        };

      case "minimal":
        return {
          entityColors: ["white", "lightgray"],
          relationColors: ["black", "gray"],
          clusterColors: ["gray"],
          fileColors: ["lightgray"],
          defaultColor: "white",
          defaultRelationColor: "black",
        };

      default:
        return {
          entityColors: [
            "lightblue", "lightgreen", "lightyellow", "lightcoral", "lightpink",
            "lightgray", "lightsteelblue", "lightseagreen", "wheat", "plum",
            "khaki", "lightcyan"
          ],
          relationColors: [
            "blue", "darkgreen", "orange", "red", "purple", "brown",
            "darkblue", "darkred", "darkorange", "darkviolet"
          ],
          clusterColors: ["blue", "green", "red", "purple", "orange", "brown"],
          fileColors: ["gray", "darkgray"],
          defaultColor: "white",
          defaultRelationColor: "black",
        };
    }
  }
}
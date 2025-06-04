import { glob } from 'glob';
import * as fs from 'fs';
import * as path from 'path';
import { ChunkingOptions, FileProcessor } from './processor';
import { EmbeddingService, OllamaService, PromptManager } from './llm';
import { logger } from '../shared/logger';
import { KnowledgeGraph } from '../types/KnowledgeGraph';
import { ProcessingOptions } from '../types/ProcessingOptions';
import { KnowledgeGraphConverter } from './export';
import { KnowledgeGraphBuilder, KnowledgeGraphSearch, mergeKnowledgeGraphs } from './knowledge';


/**
 * Main orchestrator for processing directories and generating knowledge graphs
 */
export class DirectoryProcessor {
  private fileProcessor: FileProcessor;
  private ollamaService: OllamaService;
  private embeddingService: EmbeddingService;
  private promptManager: PromptManager;
  private knowledgeGraphBuilder: KnowledgeGraphBuilder;
  private knowledgeGraphSearch: KnowledgeGraphSearch;

  constructor(options: ProcessingOptions) {
    // Initialize services
    this.fileProcessor = new FileProcessor();
    
    this.ollamaService = new OllamaService({
      model: options.model,
      host: options.host,
      temperature: options.temperature,
      contextLength: options.contextLength,
      repeatPenalty: options.repeatPenalty,
      seed: options.seed
    });

    this.embeddingService = new EmbeddingService({
      model: options.embeddingsModel || 'mxbai-embed-large:335m',
      host: options.host
    });

    this.promptManager = new PromptManager();
    
    this.knowledgeGraphBuilder = new KnowledgeGraphBuilder({
      ollamaService: this.ollamaService,
      promptManager: this.promptManager
    });

    this.knowledgeGraphSearch = new KnowledgeGraphSearch(
      options.embeddingsModel || 'mxbai-embed-large:335m',
      options.host
    );

    // Set custom system prompt if provided
    if (options.system) {
      this.promptManager.setCustomSystemPrompt(options.system);
    }
  }

  /**
   * Process a directory and generate knowledge graphs
   */
  async processDirectory(options: ProcessingOptions): Promise<void> {
    logger.info(`Starting knowledge graph generation`);
    logger.info(`Input: ${options.input}`);
    logger.info(`Filter: ${options.filter}`);
    logger.info(`Output: ${options.output}`);
    logger.info(`Model: ${options.model}`);

    try {
      // Find files
      const files = await this.findFiles(options.input, options.filter);
      
      if (files.length === 0) {
        logger.warn(`No files found matching pattern: ${options.filter}`);
        return;
      }

      logger.info(`Found ${files.length} files to process`);

      // Process files and generate knowledge graphs
      const knowledgeGraphs = await this.processFiles(files, options);

      // Merge all knowledge graphs
      logger.info(`Merging ${knowledgeGraphs.length} knowledge graphs`);
      const finalKG = await this.mergeGraphs(knowledgeGraphs, options);

      // Export the final knowledge graph
      await this.exportKnowledgeGraph(finalKG, options);

      logger.info(`Knowledge graph saved to: ${options.output}`);
      logger.info(
        `Final graph: ${finalKG.entities.length} entities, ${finalKG.relations.length} relations`
      );
    } catch (error) {
      logger.error(`Failed to process directory: ${error}`);
      if (options.debug) {
        console.error(error);
      }
      throw error;
    }
  }

  /**
   * Find files matching the filter pattern
   */
  private async findFiles(inputDir: string, filter: string): Promise<string[]> {
    const pattern = path.join(inputDir, filter);
    return await glob(pattern, { nodir: true });
  }

  /**
   * Process multiple files and generate knowledge graphs
   */
  private async processFiles(
    files: string[],
    options: ProcessingOptions
  ): Promise<KnowledgeGraph[]> {
    const knowledgeGraphs: KnowledgeGraph[] = [];

    // Set up chunking options
    const chunkingOptions: ChunkingOptions = {
      maxChunkSize: Number(options.chunkSize || 2000),
      overlapSize: Number(options.overlapSize || 100),
      enabled: !options.disableChunking
    };

    // Get system prompt
    const systemPrompt = await this.promptManager.getSystemPrompt(options.input, options.filter, options.description);

    for (const file of files) {
      try {
        logger.info(`Processing: ${file}`);

        // Process the file
        const processedFile = await this.fileProcessor.processFile(file, chunkingOptions);

        if (!processedFile.content.trim() && (!processedFile.images || processedFile.images.length === 0)) {
          logger.warn(`No content extracted from: ${file}`);
          continue;
        }

        // Get retrieval context if enabled
        const retrievalContext = options.disableRetrieval ? undefined : 
          await this.getRetrievalContext(processedFile.content, file, knowledgeGraphs, options);

        // Build knowledge graphs for this file
        const fileGraphs = await this.knowledgeGraphBuilder.build(
          processedFile,
          systemPrompt,
          retrievalContext
        );

        knowledgeGraphs.push(...fileGraphs);

        // Write intermediate results for debugging
        if (options.debug) {
          await this.writeIntermediateResults(knowledgeGraphs, options.output);
        }

      } catch (error) {
        logger.error(`Failed to process file ${file}: ${error}`);
        if (options.debug) {
          console.error(error);
        }
      }
    }

    return knowledgeGraphs;
  }

  /**
   * Get retrieval context for a file
   */
  private async getRetrievalContext(
    content: string,
    filePath: string,
    existingGraphs: KnowledgeGraph[],
    options: ProcessingOptions
  ): Promise<any> {
    if (!options.enableRetrieval || existingGraphs.length === 0) {
      return undefined;
    }

    return await this.knowledgeGraphSearch.searchByFileContent(
      content,
      filePath,
      existingGraphs,
      { 
        limit: options.retrievalLimit || 3, 
        includeObservations: true 
      }
    );
  }

  /**
   * Merge multiple knowledge graphs
   */
  private async mergeGraphs(
    graphs: KnowledgeGraph[],
    options: ProcessingOptions
  ): Promise<KnowledgeGraph> {
    return await mergeKnowledgeGraphs(graphs, {
      entitySimilarityThreshold: options.entitySimilarityThreshold || 0.9,
      observationSimilarityThreshold: options.observationSimilarityThreshold || 0.9,
      model: options.embeddingsModel || 'mxbai-embed-large:335m',
      host: options.host
    });
  }

  /**
   * Export knowledge graph in the requested format
   */
  private async exportKnowledgeGraph(
    knowledgeGraph: KnowledgeGraph,
    options: ProcessingOptions
  ): Promise<void> {
    const outputDir = path.dirname(options.output);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const exportFormat = options.exportFormat || 'json';
    let outputContent: string;
    let outputPath = options.output;

    switch (exportFormat) {
      case 'jsonl':
        outputContent = KnowledgeGraphConverter.toJSONL(knowledgeGraph);
        if (!outputPath.endsWith('.jsonl')) {
          outputPath = outputPath.replace(/\.[^.]+$/, '.jsonl');
        }
        break;

      case 'mcp-jsonl':
        outputContent = KnowledgeGraphConverter.toMCPJSONL(knowledgeGraph);
        if (!outputPath.endsWith('.jsonl')) {
          outputPath = outputPath.replace(/\.[^.]+$/, '.mcp.jsonl');
        }
        break;

      case 'json':
      default:
        outputContent = JSON.stringify(knowledgeGraph, null, 2);
        if (!outputPath.endsWith('.json')) {
          outputPath = outputPath.replace(/\.[^.]+$/, '.json');
        }
        break;
    }

    await fs.promises.writeFile(outputPath, outputContent);
  }

  /**
   * Write intermediate results for debugging
   */
  private async writeIntermediateResults(
    graphs: KnowledgeGraph[],
    outputPath: string
  ): Promise<void> {
    const tmpPath = outputPath + '.tmp';
    await fs.promises.writeFile(
      tmpPath,
      JSON.stringify(graphs, null, 2)
    );
  }
}
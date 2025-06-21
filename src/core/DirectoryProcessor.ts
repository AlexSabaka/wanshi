import { glob } from "glob";
import * as fs from "fs";
import * as path from "path";
import { KnowledgeGraph } from "../types/KnowledgeGraph";
import { ProcessingOptions } from "../types/ProcessingOptions";
import { DIContainer, TYPES } from "./di";
import {
  IKnowledgeGraphBuilder,
  IKnowledgeGraphSearch,
  IKnowledgeGraphMerger,
  IKnowledgeGraphExporter,
  IDirectoryProcessor,
  ChunkingOptions,
  ProcessedFile,
  IFileProcessor
} from "../types";
import { PromptManager } from "./llm";
import { Logger } from "../shared";

export interface IFileDiscoveryService {
  discover(): Promise<string[]>;
}

export class FileDiscoveryService implements IFileDiscoveryService {
  private readonly dir: string;
  private readonly filter: string;
  // private readonly exclude: string;
  private readonly logger: Logger;

  constructor(options: ProcessingOptions, logger: Logger) {
    this.logger = logger;
    this.dir = options.input;
    this.filter = options.filter;
    // this.exclude = options.exclude;
  }

  async discover(): Promise<string[]> {
    const pattern = path.join(this.dir, this.filter);
    const files = await glob(pattern, { nodir: true });

    if (files.length === 0) {
      const message = `No files found matching pattern: ${this.filter}`;
      this.logger.warn(message);
      throw new Error(message);
    }
    this.logger.info(`Found ${files.length} files to process`);

    return files;
  }
} 

/**
 * Refactored DirectoryProcessor using dependency injection
 * Focuses on orchestration while delegating business logic to services
 */
export class DirectoryProcessor implements IDirectoryProcessor {
  constructor(private container: DIContainer) {}

  /**
   * Process a directory and generate knowledge graphs
   */
  async processDirectory(options: ProcessingOptions): Promise<void> {
    const logger = await this.container.resolve<Logger>(TYPES.Logger);
    const fileDiscoveryService = await this.container.resolve<IFileDiscoveryService>(TYPES.FileDiscoveryService);

    logger.info(`Starting knowledge graph generation`);
    logger.info(
      `Input: ${options.input}, Filter: ${options.filter}, Output: ${options.output}, Model: ${options.model}`
    );

    try {
      // Orchestrate the workflow
      const files = await fileDiscoveryService.discover();

      const knowledgeGraphs = await this.processFiles(files, options);
      const finalKG = await this.mergeGraphs(knowledgeGraphs, logger);
      await this.exportKnowledgeGraph(finalKG, options);

      this.logSuccess(finalKG, options.output, logger);
    } catch (error) {
      this.handleError(error, options.debug, logger);
      throw error;
    }
  }

  /**
   * Process multiple files and generate knowledge graphs
   */
  private async processFiles(
    files: string[],
    options: ProcessingOptions
  ): Promise<KnowledgeGraph[]> {
    const knowledgeGraphs: KnowledgeGraph[] = [];

    const logger = await this.container.resolve<Logger>(TYPES.Logger);

    const fileProcessor = await this.container.resolve<IFileProcessor>(
      TYPES.FileProcessor
    );
    const kgBuilder = await this.container.resolve<IKnowledgeGraphBuilder>(
      TYPES.KnowledgeGraphBuilder
    );

    for (const file of files) {
      try {
        const fileGraphs = await this.processFile(
          file,
          options,
          fileProcessor,
          kgBuilder,
          knowledgeGraphs,
          logger
        );
        knowledgeGraphs.push(...fileGraphs);

        if (options.debug) {
          await this.writeIntermediateResults(knowledgeGraphs, options.output);
        }
      } catch (error) {
        this.handleFileError(file, error, options.debug, logger);
      }
    }

    return knowledgeGraphs;
  }

  /**
   * Process a single file
   */
  private async processFile(
    file: string,
    options: ProcessingOptions,
    fileProcessor: IFileProcessor,
    kgBuilder: IKnowledgeGraphBuilder,
    existingGraphs: KnowledgeGraph[],
    logger: Logger
  ): Promise<KnowledgeGraph[]> {
    logger.info(`Processing: ${file}`);

    const processedFile = await fileProcessor.processFile(file);
    this.validateProcessedFile(processedFile, file, logger);

    const retrievalContext = await this.getRetrievalContext(
      processedFile,
      file,
      existingGraphs,
      options
    );

    const promptManager = (await this.container.resolve(
      TYPES.PromptManager
    )) as PromptManager;
    const systemPrompt = await promptManager.getSystemPrompt(
      options.input,
      options.filter,
      options.description
    );

    return await kgBuilder.build(processedFile, systemPrompt, retrievalContext);
  }

  /**
   * Validate processed file content
   */
  private validateProcessedFile(
    processedFile: ProcessedFile,
    filePath: string,
    logger: Logger
  ): void {
    if (!processedFile.chunks?.length) {
      logger.warn(`No content extracted from: ${filePath}`);
      throw new Error(`No content extracted from file: ${filePath}`);
    }
  }

  /**
   * Get retrieval context for improved processing
   */
  private async getRetrievalContext(
    processedFile: ProcessedFile,
    filePath: string,
    existingGraphs: KnowledgeGraph[],
    options: ProcessingOptions
  ): Promise<any> {
    if (!this.shouldUseRetrieval(options) || existingGraphs.length === 0) {
      return undefined;
    }

    const searchService = await this.container.resolve<IKnowledgeGraphSearch>(
      TYPES.KnowledgeGraphSearch
    );

    return await searchService.searchByFileContent(
      processedFile.chunks[0].content,
      filePath,
      existingGraphs,
      {
        limit: options.retrievalLimit || 3,
        includeObservations: true,
      }
    );
  }

  /**
   * Determine if retrieval should be used
   */
  private shouldUseRetrieval(options: ProcessingOptions): boolean {
    // Fix the conflicting boolean pairs issue
    if (options.retrieval === "disabled") return false;
    if (options.retrieval === "enabled") return true;
    return true; // Auto to true
  }

  /**
   * Merge multiple knowledge graphs
   */
  private async mergeGraphs(
    graphs: KnowledgeGraph[],
    logger: Logger
  ): Promise<KnowledgeGraph> {
    logger.info(`Merging ${graphs.length} knowledge graphs`);

    const merger = await this.container.resolve<IKnowledgeGraphMerger>(
      TYPES.KnowledgeGraphMerger
    );

    return await merger.merge(graphs);
  }

  /**
   * Export knowledge graph in the requested format
   */
  private async exportKnowledgeGraph(
    knowledgeGraph: KnowledgeGraph,
    options: ProcessingOptions
  ): Promise<void> {
    await this.ensureOutputDirectory(options.output);

    const exporter = await this.container.resolve<IKnowledgeGraphExporter>(
      TYPES.KnowledgeGraphExportService
    );
    const exportFormat = options.exportFormat || "json";

    if (!exporter.isFormatSupported(exportFormat)) {
      throw new Error(
        `Unsupported export format: ${exportFormat}. Supported: ${exporter
          .getSupportedFormats()
          .join(", ")}`
      );
    }

    const outputContent = exporter.export(knowledgeGraph, exportFormat);
    const outputPath = this.getOutputPath(options.output, exportFormat);

    await fs.promises.writeFile(outputPath, outputContent);
  }

  /**
   * Ensure output directory exists
   */
  private async ensureOutputDirectory(outputPath: string): Promise<void> {
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
  }

  /**
   * Get the final output path with correct extension
   */
  private getOutputPath(originalPath: string, format: string): string {
    return originalPath.endsWith(`.${format}`)
      ? originalPath
      : originalPath.replace(/\.[^.]+$/, `.${format}`);
  }

  /**
   * Write intermediate results for debugging
   */
  private async writeIntermediateResults(
    graphs: KnowledgeGraph[],
    outputPath: string
  ): Promise<void> {
    const tmpPath = outputPath + ".tmp";
    await fs.promises.writeFile(tmpPath, JSON.stringify(graphs, null, 2));
  }

  /**
   * Handle file processing errors
   */
  private handleFileError(file: string, error: any, debug: boolean, logger: Logger): void {
    logger.error(`Failed to process file ${file}: ${error.message || error}`);
  }

  /**
   * Handle general processing errors
   */
  private handleError(error: any, debug: boolean, logger: Logger): void {
    logger.error(`Failed to process directory: ${error.message || error}`);
  }

  /**
   * Log successful completion
   */
  private logSuccess(knowledgeGraph: KnowledgeGraph, outputPath: string, logger: Logger): void {
    logger.info(`Knowledge graph saved to: ${outputPath}`);
    logger.info(`Final graph: ${knowledgeGraph.entities.length} entities, ${knowledgeGraph.relations.length} relations`);
  }
}

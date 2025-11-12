import { Logger } from "../../shared";
import { ProcessingOptions } from "../../types";
import {
  ILLMService,
  IPromptManager,
  IKnowledgeGraphMerger,
} from "../../types";
import { DIContainer } from "./DIContainer";
import { EmbeddingService } from "../llm";
import { FileReaderFactory, TextChunker } from "../processor";
import { IContentClassifier } from "../processor/classifier";
import { LlmContentClassifier } from "../processor/classifier/LlmContentClassifier";

/**
 * Service identifiers for dependency injection
 */
export const TYPES = {
  Logger: Symbol.for("Logger"),
  LLMService: Symbol.for("LLMService"),
  EmbeddingService: Symbol.for("EmbeddingService"),
  PromptManager: Symbol.for("PromptManager"),
  FileDiscoveryService: Symbol.for("FileDiscoveryService"),
  FileReaderFactory: Symbol.for("FileReaderFactory"),
  FileProcessor: Symbol.for("FileProcessor"),
  ContentClassifier: Symbol.for("ContentClassifier"),
  TextChunker: Symbol.for("TextChunker"),
  KnowledgeGraphBuilder: Symbol.for("KnowledgeGraphBuilder"),
  KnowledgeGraphSearch: Symbol.for("KnowledgeGraphSearch"),
  KnowledgeGraphMerger: Symbol.for("KnowledgeGraphMerger"),
  DirectoryProcessor: Symbol.for("DirectoryProcessor"),
  KnowledgeGraphExportService: Symbol.for("KnowledgeGraphExportService"),
  ProcessingOptions: Symbol.for("ProcessingOptions"),
};

/**
 * Factory function type for creating services
 */
export type ServiceFactory<T> = (container: DIContainer) => T | Promise<T>;

/**
 * Service registration with lifecycle management
 */
export interface ServiceRegistration<T = any> {
  factory: ServiceFactory<T>;
  singleton: boolean;
  instance?: T;
}

/**
 * Configuration for the DI container
 */
export interface ContainerConfig {
  processingOptions?: Partial<ProcessingOptions>;
}

/**
 * Factory for creating configured DI containers
 */
export class ContainerFactory {
  /**
   * Create a fully configured container
   */
  static createContainer(config: ContainerConfig): DIContainer {
    const container = new DIContainer();

    // Register configuration
    container.registerValue<ProcessingOptions>(
      TYPES.ProcessingOptions,
      config.processingOptions as ProcessingOptions
    );

    // Register logger
    container.register(TYPES.Logger, async (c) => {
      const { LoggerFactory } = await import("../../shared/logger");
      const options = await c.resolve<ProcessingOptions>(
        TYPES.ProcessingOptions
      );

      return LoggerFactory.createLogger(options);
    });

    // Register LLM services
    container.register(TYPES.LLMService, async (c) => {
      const { OllamaService } = await import("../llm/OllamaService");
      const options = await c.resolve<ProcessingOptions>(
        TYPES.ProcessingOptions
      );
      const logger = await c.resolve<Logger>(TYPES.Logger);

      return new OllamaService(
        {
          model: options.model,
          host: options.host,
          images: options.images !== "disabled",
          temperature: options.temperature,
          contextLength: options.contextLength,
          repeatPenalty: options.repeatPenalty,
          seed: options.seed,
        },
        logger
      );
    });

    // Register Embedding service
    container.register(TYPES.EmbeddingService, async (c) => {
      const { EmbeddingService } = await import("../llm/EmbeddingService");
      const options = await c.resolve<ProcessingOptions>(
        TYPES.ProcessingOptions
      );
      const logger = await c.resolve<Logger>(TYPES.Logger);

      return new EmbeddingService(
        {
          model: options.embeddingsModel || "mxbai-embed-large:335m",
          host: options.host,
        },
        logger
      );
    });

    // Register Prompt Manager
    container.register(TYPES.PromptManager, async (c) => {
      const { PromptManager } = await import("../llm/prompts/PromptManager");
      const logger = await c.resolve<Logger>(TYPES.Logger);

      const manager = new PromptManager(logger);

      // Set custom system prompt if provided
      const options = config.processingOptions;
      if (options?.system) {
        manager.setCustomSystemPrompt(options.system);
      }

      return manager;
    });

    container.register(TYPES.FileDiscoveryService, async (c) => {
      const { FileDiscoveryService } = await import("..");
      const options = await c.resolve<ProcessingOptions>(
        TYPES.ProcessingOptions
      );
      const logger = await c.resolve<Logger>(TYPES.Logger);

      return new FileDiscoveryService(options, logger);
    });

    container.register(TYPES.TextChunker, async (c) => {
      const options = await c.resolve<ProcessingOptions>(
        TYPES.ProcessingOptions
      );
      const logger = await c.resolve<Logger>(TYPES.Logger);
      return new TextChunker(
        {
          enabled: options.chunking !== "disabled",
          maxChunkSize: options.chunkSize || 2000,
          overlapSize: options.overlapSize || 100,
        },
        logger
      );
    });

    // Register File REader Factory
    container.register(TYPES.FileReaderFactory, async (c) => {
      const {
        FileReaderFactory,
        AudioReader,
        MarkdownReader,
        DoclingReader,
        HtmlReader,
        ImageReader,
        OfficeReader,
        TextReader,
        PdfReader,
        RtfReader
      } = await import(
        "../processor/readers"
      );
      const options = await c.resolve<ProcessingOptions>(
        TYPES.ProcessingOptions
      );
      const logger = await c.resolve<Logger>(TYPES.Logger);
      const chunker = await c.resolve<TextChunker>(TYPES.TextChunker);
      const factory = new FileReaderFactory(logger);

      if (options.docling) {
        logger.info(`Using docling document reading pipeline`);
        factory.registerReader(
          new DoclingReader(undefined, undefined, undefined, "./temp", chunker, logger)
        );
      } else {
        factory.registerReader(new RtfReader(chunker, logger));
        factory.registerReader(new MarkdownReader(chunker, logger));
        factory.registerReader(new HtmlReader(chunker, logger));
        factory.registerReader(new ImageReader(chunker, logger));
        factory.registerReader(new OfficeReader(chunker, logger));
        factory.registerReader(new PdfReader(chunker, logger));
      }

      factory.registerReader(new TextReader(chunker, logger));
      
      if (options.asr !== "disabled") {
        logger.info(`Using automatic speech recognition pipeline`);
        factory.registerReader(
          new AudioReader(
            {
              modelName: options.whisperModel,
              language: options.language,
              translate: options.translate,
            },
            "./temp",
            chunker, 
            logger
          )
        );
      }

      return factory;
    });

    // Register Content Classifier
    container.register<IContentClassifier | undefined>(TYPES.ContentClassifier, async (c) => {
      const {
        HeuristicContentClassifier,
        BertContentClassifier
      } = await import("../processor/classifier");
      const options = await c.resolve<ProcessingOptions>(
        TYPES.ProcessingOptions
      );
      const logger = await c.resolve<Logger>(TYPES.Logger);
      switch (options.classifier) {
        case "bert": return new BertContentClassifier(logger);
        case "heuristic": return new HeuristicContentClassifier(logger);
        case "llm": return new LlmContentClassifier(logger);
        default: return undefined;
      }
    });

    // Register File Processor
    container.register(TYPES.FileProcessor, async (c) => {
      const { FileProcessor } = await import("../processor");
      const factory = await c.resolve<FileReaderFactory>(
        TYPES.FileReaderFactory
      );
      const options = await c.resolve<ProcessingOptions>(
        TYPES.ProcessingOptions
      );
      const classifier = await c.resolve<IContentClassifier | undefined>(
        TYPES.ContentClassifier
      );
      const logger = await c.resolve<Logger>(TYPES.Logger);
      return new FileProcessor(factory, classifier, options.images !== "disabled", logger);
    });

    // Register Knowledge Graph Builder
    container.register(TYPES.KnowledgeGraphBuilder, async (c) => {
      const { KnowledgeGraphBuilder } = await import(
        "../knowledge/KnowledgeGraphBuilder"
      );
      const logger = await c.resolve<Logger>(TYPES.Logger);
      const llmService = await c.resolve<ILLMService>(TYPES.LLMService);
      const promptManager = await c.resolve<IPromptManager>(
        TYPES.PromptManager
      );

      return new KnowledgeGraphBuilder(
        {
          ollamaService: llmService as any, // TODO: Update KnowledgeGraphBuilder to use interface
          promptManager: promptManager as any,
        },
        logger
      );
    });

    // Register Knowledge Graph Search
    container.register(TYPES.KnowledgeGraphSearch, async (c) => {
      const { KnowledgeGraphSearch } = await import("../knowledge");
      const logger = await c.resolve<Logger>(TYPES.Logger);
      const embeddingService = await c.resolve<EmbeddingService>(
        TYPES.EmbeddingService
      );

      return new KnowledgeGraphSearch(embeddingService, logger);
    });

    // Register Knowledge Graph Merger
    container.register(TYPES.KnowledgeGraphMerger, async (c) => {
      const { mergeKnowledgeGraphs } = await import("../knowledge");
      const logger = await c.resolve<Logger>(TYPES.Logger);
      const options = await c.resolve<ProcessingOptions>(
        TYPES.ProcessingOptions
      );
      const embeddingService = await c.resolve<EmbeddingService>(
        TYPES.EmbeddingService
      );

      // Return a wrapper that implements the interface
      return {
        merge: async (graphs) => {
          return await mergeKnowledgeGraphs(
            graphs,
            {
              entitySimilarityThreshold: options.entitySimilarityThreshold,
              observationSimilarityThreshold:
                options.observationSimilarityThreshold,
            },
            embeddingService,
            logger
          );
        },
      } as IKnowledgeGraphMerger;
    });

    // Register Knowledge Graph Export Service
    container.register(TYPES.KnowledgeGraphExportService, async (c) => {
      const {
        JsonExportStrategy,
        JsonlExportStrategy,
        McpExportStrategy,
        GraphvizDotExportStrategy,
      } = await import("../export/strategies");
      const { KnowledgeGraphExportService } = await import(
        "../export/KnowledgeGraphExportService"
      );

      return new KnowledgeGraphExportService(
        new JsonExportStrategy(),
        new JsonlExportStrategy(),
        new McpExportStrategy(),
        new GraphvizDotExportStrategy()
      );
    });

    // Register Directory Processor (depends on all other services)
    container.register(TYPES.DirectoryProcessor, async (c) => {
      const { DirectoryProcessor } = await import("../DirectoryProcessor");
      return new DirectoryProcessor(c);
    });

    return container;
  }
}

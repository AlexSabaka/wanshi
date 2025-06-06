import { ProcessingOptions } from '../../types';
import {
  ILLMService,
  IEmbeddingService,
  IPromptManager,
  IFileProcessor,
  IKnowledgeGraphBuilder,
  IKnowledgeGraphSearch,
  IKnowledgeGraphMerger,
  IDirectoryProcessor,
  IKnowledgeGraphExporter,
  LLMConfig,
  EmbeddingConfig
} from '../../types';

/**
 * Service identifiers for dependency injection
 */
export const TYPES = {
  LLMService: Symbol.for('LLMService'),
  EmbeddingService: Symbol.for('EmbeddingService'),
  PromptManager: Symbol.for('PromptManager'),
  FileProcessor: Symbol.for('FileProcessor'),
  KnowledgeGraphBuilder: Symbol.for('KnowledgeGraphBuilder'),
  KnowledgeGraphSearch: Symbol.for('KnowledgeGraphSearch'),
  KnowledgeGraphMerger: Symbol.for('KnowledgeGraphMerger'),
  DirectoryProcessor: Symbol.for('DirectoryProcessor'),
  KnowledgeGraphExporter: Symbol.for('KnowledgeGraphExporter'),
  Logger: Symbol.for('Logger'),
  ProcessingOptions: Symbol.for('ProcessingOptions')
};

/**
 * Factory function type for creating services
 */
type ServiceFactory<T> = (container: DIContainer) => T | Promise<T>;

/**
 * Service registration with lifecycle management
 */
interface ServiceRegistration<T = any> {
  factory: ServiceFactory<T>;
  singleton: boolean;
  instance?: T;
}

/**
 * Simple but powerful Dependency Injection Container
 * Supports async factories, singletons, and circular dependency detection
 */
export class DIContainer {
  private services = new Map<symbol | string, ServiceRegistration>();
  private resolving = new Set<symbol | string>();

  /**
   * Register a service factory
   */
  register<T>(
    identifier: symbol | string,
    factory: ServiceFactory<T>,
    options: { singleton?: boolean } = {}
  ): void {
    this.services.set(identifier, {
      factory,
      singleton: options.singleton ?? true
    });
  }

  /**
   * Register a singleton value
   */
  registerValue<T>(identifier: symbol | string, value: T): void {
    this.services.set(identifier, {
      factory: () => value,
      singleton: true,
      instance: value
    });
  }

  /**
   * Resolve a service
   */
  async resolve<T>(identifier: symbol | string): Promise<T> {
    const registration = this.services.get(identifier);
    
    if (!registration) {
      throw new Error(`Service not registered: ${String(identifier)}`);
    }

    // Check for circular dependencies
    if (this.resolving.has(identifier)) {
      throw new Error(`Circular dependency detected: ${String(identifier)}`);
    }

    // Return existing singleton instance if available
    if (registration.singleton && registration.instance) {
      return registration.instance as T;
    }

    try {
      this.resolving.add(identifier);
      
      // Create new instance
      const instance = await registration.factory(this);
      
      // Store singleton instance
      if (registration.singleton) {
        registration.instance = instance;
      }
      
      return instance as T;
    } finally {
      this.resolving.delete(identifier);
    }
  }

  /**
   * Check if a service is registered
   */
  has(identifier: symbol | string): boolean {
    return this.services.has(identifier);
  }

  /**
   * Clear all registrations
   */
  clear(): void {
    this.services.clear();
    this.resolving.clear();
  }

  /**
   * Create a child container with inherited registrations
   */
  createChildContainer(): DIContainer {
    const child = new DIContainer();
    
    // Copy all registrations (but not instances)
    for (const [key, registration] of this.services) {
      child.services.set(key, {
        factory: registration.factory,
        singleton: registration.singleton
      });
    }
    
    return child;
  }
}

/**
 * Configuration for the DI container
 */
export interface ContainerConfig {
  processingOptions: ProcessingOptions;
  llmConfig?: Partial<LLMConfig>;
  embeddingConfig?: Partial<EmbeddingConfig>;
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
    container.registerValue(TYPES.ProcessingOptions, config.processingOptions);
    
    // Register LLM services
    container.register(TYPES.LLMService, async (c) => {
      const { OllamaService } = await import('../llm/OllamaService');
      const options = await c.resolve<ProcessingOptions>(TYPES.ProcessingOptions);
      
      return new OllamaService({
        model: config.llmConfig?.model || options.model,
        host: config.llmConfig?.host || options.host,
        temperature: config.llmConfig?.temperature || options.temperature,
        contextLength: config.llmConfig?.contextLength || options.contextLength,
        repeatPenalty: config.llmConfig?.repeatPenalty || options.repeatPenalty,
        seed: config.llmConfig?.seed || options.seed
      });
    });
    
    // Register Embedding service
    container.register(TYPES.EmbeddingService, async (c) => {
      const { EmbeddingService } = await import('../llm/EmbeddingService');
      const options = await c.resolve<ProcessingOptions>(TYPES.ProcessingOptions);
      
      return new EmbeddingService({
        model: config.embeddingConfig?.model || options.embeddingsModel || 'mxbai-embed-large:335m',
        host: config.embeddingConfig?.host || options.host
      });
    });
    
    // Register Prompt Manager
    container.register(TYPES.PromptManager, async () => {
      const { PromptManager } = await import('../llm/prompts/PromptManager');
      const manager = new PromptManager();
      
      // Set custom system prompt if provided
      const options = config.processingOptions;
      if (options.system) {
        manager.setCustomSystemPrompt(options.system);
      }
      
      return manager;
    });
    
    // Register File Processor
    container.register(TYPES.FileProcessor, async () => {
      const { FileProcessor } = await import('../processor/FileProcessor');
      return new FileProcessor();
    });
    
    // Register Knowledge Graph Builder
    container.register(TYPES.KnowledgeGraphBuilder, async (c) => {
      const { KnowledgeGraphBuilder } = await import('../knowledge/KnowledgeGraphBuilder');
      const llmService = await c.resolve<ILLMService>(TYPES.LLMService);
      const promptManager = await c.resolve<IPromptManager>(TYPES.PromptManager);
      
      return new KnowledgeGraphBuilder({
        ollamaService: llmService as any, // TODO: Update KnowledgeGraphBuilder to use interface
        promptManager: promptManager as any
      });
    });
    
    // Register Knowledge Graph Search
    container.register(TYPES.KnowledgeGraphSearch, async (c) => {
      const { KnowledgeGraphSearch } = await import('../knowledge');
      const options = await c.resolve<ProcessingOptions>(TYPES.ProcessingOptions);
      
      return new KnowledgeGraphSearch(
        options.embeddingsModel || 'mxbai-embed-large:335m',
        options.host
      );
    });
    
    // Register Knowledge Graph Merger
    container.register(TYPES.KnowledgeGraphMerger, async (c) => {
      const { mergeKnowledgeGraphs } = await import('../knowledge');
      const embeddingService = await c.resolve<IEmbeddingService>(TYPES.EmbeddingService);
      
      // Return a wrapper that implements the interface
      return {
        merge: async (graphs, options) => {
          return await mergeKnowledgeGraphs(graphs, {
            entitySimilarityThreshold: options.entitySimilarityThreshold,
            observationSimilarityThreshold: options.observationSimilarityThreshold,
            model: options.model!,
            host: options.host!
          });
        }
      } as IKnowledgeGraphMerger;
    });
    
    // Register Knowledge Graph Exporter
    container.register(TYPES.KnowledgeGraphExporter, async () => {
      const { KnowledgeGraphConverter } = await import('../export/KnowledgeGraphConverter');
      
      // Return a wrapper that implements the interface
      return {
        export: (knowledgeGraph, format) => {
          switch (format) {
            case 'jsonl':
              return KnowledgeGraphConverter.toJSONL(knowledgeGraph);
            case 'mcp-jsonl':
              return KnowledgeGraphConverter.toMCPJSONL(knowledgeGraph);
            case 'json':
            default:
              return JSON.stringify(knowledgeGraph, null, 2);
          }
        },
        isFormatSupported: (format) => {
          return ['json', 'jsonl', 'mcp-jsonl'].includes(format);
        },
        getSupportedFormats: () => {
          return ['json', 'jsonl', 'mcp-jsonl'];
        }
      } as IKnowledgeGraphExporter;
    });
    
    // Register Logger
    container.register(TYPES.Logger, async () => {
      const { logger } = await import('../../shared/logger');
      return logger;
    });
    
    // Register Directory Processor (depends on all other services)
    container.register(TYPES.DirectoryProcessor, async (c) => {
      const { DirectoryProcessor } = await import('../DirectoryProcessor');
      return new DirectoryProcessor(c);
    });
    
    return container;
  }
}
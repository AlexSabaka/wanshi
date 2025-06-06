import { DIContainer, TYPES, ContainerFactory, ContainerConfig } from '../di';
import { ProcessingOptions, LegacyProcessingOptions, ProcessingOptionsUtils } from '../../types/ProcessingOptions';
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
} from '../interfaces';

/**
 * Service locator and factory for creating properly configured services
 * Bridges between the DI container and the application
 */
export class ServiceFactory {
  private container: DIContainer | null = null;

  /**
   * Initialize the service factory with processing options
   */
  async initialize(options: ProcessingOptions | LegacyProcessingOptions): Promise<void> {
    // Convert legacy options if needed
    const processedOptions = this.normalizeOptions(options);
    
    // Validate options
    const validationErrors = ProcessingOptionsUtils.validate(processedOptions);
    if (validationErrors.length > 0) {
      throw new Error(`Configuration validation failed: ${validationErrors.join(', ')}`);
    }

    // Create container configuration
    const containerConfig: ContainerConfig = {
      processingOptions: processedOptions,
      llmConfig: this.createLLMConfig(processedOptions),
      embeddingConfig: this.createEmbeddingConfig(processedOptions)
    };

    // Create and configure container
    this.container = ContainerFactory.createContainer(containerConfig);
  }

  /**
   * Get the DirectoryProcessor instance
   */
  async getDirectoryProcessor(): Promise<IDirectoryProcessor> {
    this.ensureInitialized();
    return await this.container!.resolve<IDirectoryProcessor>(TYPES.DirectoryProcessor);
  }

  /**
   * Get the LLM service instance
   */
  async getLLMService(): Promise<ILLMService> {
    this.ensureInitialized();
    return await this.container!.resolve<ILLMService>(TYPES.LLMService);
  }

  /**
   * Get the Embedding service instance
   */
  async getEmbeddingService(): Promise<IEmbeddingService> {
    this.ensureInitialized();
    return await this.container!.resolve<IEmbeddingService>(TYPES.EmbeddingService);
  }

  /**
   * Get the File Processor instance
   */
  async getFileProcessor(): Promise<IFileProcessor> {
    this.ensureInitialized();
    return await this.container!.resolve<IFileProcessor>(TYPES.FileProcessor);
  }

  /**
   * Get the Knowledge Graph Builder instance
   */
  async getKnowledgeGraphBuilder(): Promise<IKnowledgeGraphBuilder> {
    this.ensureInitialized();
    return await this.container!.resolve<IKnowledgeGraphBuilder>(TYPES.KnowledgeGraphBuilder);
  }

  /**
   * Get the Knowledge Graph Search instance
   */
  async getKnowledgeGraphSearch(): Promise<IKnowledgeGraphSearch> {
    this.ensureInitialized();
    return await this.container!.resolve<IKnowledgeGraphSearch>(TYPES.KnowledgeGraphSearch);
  }

  /**
   * Get the Knowledge Graph Merger instance
   */
  async getKnowledgeGraphMerger(): Promise<IKnowledgeGraphMerger> {
    this.ensureInitialized();
    return await this.container!.resolve<IKnowledgeGraphMerger>(TYPES.KnowledgeGraphMerger);
  }

  /**
   * Get the Knowledge Graph Exporter instance
   */
  async getKnowledgeGraphExporter(): Promise<IKnowledgeGraphExporter> {
    this.ensureInitialized();
    return await this.container!.resolve<IKnowledgeGraphExporter>(TYPES.KnowledgeGraphExporter);
  }

  /**
   * Get the Prompt Manager instance
   */
  async getPromptManager(): Promise<IPromptManager> {
    this.ensureInitialized();
    return await this.container!.resolve<IPromptManager>(TYPES.PromptManager);
  }

  /**
   * Validate service health
   */
  async validateServices(): Promise<ServiceHealthReport> {
    this.ensureInitialized();
    
    const report: ServiceHealthReport = {
      healthy: true,
      services: {},
      errors: []
    };

    try {
      // Test LLM service
      const llmService = await this.getLLMService();
      const llmHealthy = await llmService.isAvailable();
      report.services.llm = { healthy: llmHealthy, service: 'LLM Service' };
      
      if (!llmHealthy) {
        report.healthy = false;
        report.errors.push('LLM service is not available');
      }

      // Test other services (basic instantiation)
      const services = [
        { name: 'fileProcessor', getter: () => this.getFileProcessor() },
        { name: 'promptManager', getter: () => this.getPromptManager() },
        { name: 'embeddingService', getter: () => this.getEmbeddingService() }
      ];

      for (const service of services) {
        try {
          await service.getter();
          report.services[service.name] = { healthy: true, service: service.name };
        } catch (error) {
          report.healthy = false;
          report.services[service.name] = { healthy: false, service: service.name, error: (error as Error).message };
          report.errors.push(`${service.name} failed to initialize: ${(error as Error).message}`);
        }
      }

    } catch (error) {
      report.healthy = false;
      report.errors.push(`Service validation failed: ${(error as Error).message}`);
    }

    return report;
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    if (this.container) {
      this.container.clear();
      this.container = null;
    }
  }

  /**
   * Create a child service factory with modified configuration
   */
  createChild(modifications: Partial<ProcessingOptions>): ServiceFactory {
    this.ensureInitialized();
    
    const childFactory = new ServiceFactory();
    // Child gets a copy of the current container
    // TODO: Implement container inheritance properly
    return childFactory;
  }

  /**
   * Normalize options to handle legacy format
   */
  private normalizeOptions(options: ProcessingOptions | LegacyProcessingOptions): ProcessingOptions {
    // Check if this is the legacy format
    if ('enableRetrieval' in options || 'disableRetrieval' in options || 
        'enableChunking' in options || 'disableChunking' in options) {
      return ProcessingOptionsUtils.fromLegacy(options as LegacyProcessingOptions);
    }
    
    return options as ProcessingOptions;
  }

  /**
   * Create LLM configuration from processing options
   */
  private createLLMConfig(options: ProcessingOptions): LLMConfig {
    return {
      model: options.model,
      host: options.host,
      temperature: options.temperature,
      contextLength: options.contextLength,
      repeatPenalty: options.repeatPenalty,
      seed: options.seed
    };
  }

  /**
   * Create embedding configuration from processing options
   */
  private createEmbeddingConfig(options: ProcessingOptions): EmbeddingConfig {
    return {
      model: options.embeddingsModel || 'mxbai-embed-large:335m',
      host: options.host
    };
  }

  /**
   * Ensure the factory is initialized
   */
  private ensureInitialized(): void {
    if (!this.container) {
      throw new Error('ServiceFactory not initialized. Call initialize() first.');
    }
  }
}

/**
 * Service health information
 */
export interface ServiceHealthInfo {
  healthy: boolean;
  service: string;
  error?: string;
  details?: Record<string, any>;
}

/**
 * Overall service health report
 */
export interface ServiceHealthReport {
  healthy: boolean;
  services: Record<string, ServiceHealthInfo>;
  errors: string[];
  timestamp?: Date;
}

/**
 * Global service factory instance for convenience
 */
export const serviceFactory = new ServiceFactory();

/**
 * Helper function to initialize services with error handling
 */
export async function initializeServices(options: ProcessingOptions | LegacyProcessingOptions): Promise<ServiceHealthReport> {
  try {
    await serviceFactory.initialize(options);
    return await serviceFactory.validateServices();
  } catch (error) {
    return {
      healthy: false,
      services: {},
      errors: [`Initialization failed: ${(error as Error).message}`],
      timestamp: new Date()
    };
  }
}

/**
 * Helper function to safely get a service with error handling
 */
export async function getService<T>(
  serviceGetter: () => Promise<T>,
  serviceName: string
): Promise<T> {
  try {
    return await serviceGetter();
  } catch (error) {
    throw new Error(`Failed to get ${serviceName}: ${(error as Error).message}`);
  }
}

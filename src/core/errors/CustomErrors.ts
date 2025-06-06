/**
 * Custom error types for the knowledge graph generation system
 * Provides specific error handling for different failure modes
 */

/**
 * Base error class for all knowledge graph related errors
 */
export abstract class KnowledgeGraphError extends Error {
  public readonly timestamp: Date;
  public readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.timestamp = new Date();
    
    // Ensure proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, new.target.prototype);
  }

  /**
   * Convert error to structured object for logging/serialization
   */
  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      timestamp: this.timestamp.toISOString(),
      stack: this.stack
    };
  }
}

/**
 * File processing related errors
 */
export class FileProcessingError extends KnowledgeGraphError {
  constructor(
    message: string,
    public readonly filePath: string,
    public readonly reason?: string
  ) {
    super(`File processing failed for ${filePath}: ${message}`, 'FILE_PROCESSING_ERROR');
  }
}

/**
 * LLM service related errors
 */
export class LLMServiceError extends KnowledgeGraphError {
  constructor(
    message: string,
    public readonly model: string,
    public readonly host: string,
    public readonly statusCode?: number
  ) {
    super(`LLM service error (${model}@${host}): ${message}`, 'LLM_SERVICE_ERROR');
  }
}

/**
 * Knowledge graph generation errors
 */
export class KnowledgeGraphGenerationError extends KnowledgeGraphError {
  constructor(
    message: string,
    public readonly context?: any
  ) {
    super(`Knowledge graph generation failed: ${message}`, 'KG_GENERATION_ERROR');
  }
}

/**
 * Configuration validation errors
 */
export class ConfigurationError extends KnowledgeGraphError {
  constructor(
    message: string,
    public readonly violations: string[]
  ) {
    super(`Configuration invalid: ${message}`, 'CONFIGURATION_ERROR');
  }
}

/**
 * Dependency injection related errors
 */
export class DIContainerError extends KnowledgeGraphError {
  constructor(
    message: string,
    public readonly serviceIdentifier?: string | symbol
  ) {
    super(`Dependency injection error: ${message}`, 'DI_CONTAINER_ERROR');
  }
}

/**
 * Export/serialization errors
 */
export class ExportError extends KnowledgeGraphError {
  constructor(
    message: string,
    public readonly format: string,
    public readonly outputPath: string
  ) {
    super(`Export failed for format ${format} to ${outputPath}: ${message}`, 'EXPORT_ERROR');
  }
}

/**
 * Network/connectivity errors
 */
export class NetworkError extends KnowledgeGraphError {
  constructor(
    message: string,
    public readonly url: string,
    public readonly statusCode?: number
  ) {
    super(`Network error for ${url}: ${message}`, 'NETWORK_ERROR');
  }
}

/**
 * Validation errors for input data
 */
export class ValidationError extends KnowledgeGraphError {
  constructor(
    message: string,
    public readonly field: string,
    public readonly value: any
  ) {
    super(`Validation failed for ${field}: ${message}`, 'VALIDATION_ERROR');
  }
}

/**
 * Timeout errors for long-running operations
 */
export class TimeoutError extends KnowledgeGraphError {
  constructor(
    message: string,
    public readonly operation: string,
    public readonly timeoutMs: number
  ) {
    super(`Operation ${operation} timed out after ${timeoutMs}ms: ${message}`, 'TIMEOUT_ERROR');
  }
}

/**
 * Memory/resource related errors
 */
export class ResourceError extends KnowledgeGraphError {
  constructor(
    message: string,
    public readonly resource: string
  ) {
    super(`Resource error for ${resource}: ${message}`, 'RESOURCE_ERROR');
  }
}

/**
 * Error handler utility for consistent error processing
 */
export class ErrorHandler {
  /**
   * Determine if an error is recoverable
   */
  static isRecoverable(error: Error): boolean {
    if (error instanceof NetworkError && error.statusCode && error.statusCode < 500) {
      return true; // Client errors might be retryable
    }
    
    if (error instanceof TimeoutError) {
      return true; // Timeouts are often transient
    }
    
    if (error instanceof ResourceError) {
      return false; // Resource issues typically need intervention
    }
    
    return false; // Conservative default
  }

  /**
   * Extract user-friendly error message
   */
  static getUserMessage(error: Error): string {
    if (error instanceof KnowledgeGraphError) {
      switch (error.code) {
        case 'FILE_PROCESSING_ERROR':
          return `Unable to process file. Please check the file format and permissions.`;
        case 'LLM_SERVICE_ERROR':
          return `AI service unavailable. Please check your Ollama installation and model availability.`;
        case 'CONFIGURATION_ERROR':
          return `Configuration issue detected. Please verify your settings.`;
        case 'NETWORK_ERROR':
          return `Network connectivity issue. Please check your internet connection.`;
        default:
          return error.message;
      }
    }
    
    return 'An unexpected error occurred. Please try again.';
  }

  /**
   * Create error context for debugging
   */
  static createContext(error: Error, additionalContext?: Record<string, any>): Record<string, any> {
    const context: Record<string, any> = {
      errorType: error.constructor.name,
      message: error.message,
      timestamp: new Date().toISOString()
    };

    if (error instanceof KnowledgeGraphError) {
      context.code = error.code;
      context.errorTimestamp = error.timestamp.toISOString();
    }

    if (additionalContext) {
      Object.assign(context, additionalContext);
    }

    return context;
  }

  /**
   * Log error with appropriate level
   */
  static logError(error: Error, logger: any, context?: Record<string, any>): void {
    const errorContext = this.createContext(error, context);
    
    if (error instanceof KnowledgeGraphError) {
      switch (error.code) {
        case 'VALIDATION_ERROR':
        case 'CONFIGURATION_ERROR':
          logger.warn('Configuration issue detected', errorContext);
          break;
        case 'NETWORK_ERROR':
        case 'TIMEOUT_ERROR':
          logger.error('Service connectivity issue', errorContext);
          break;
        case 'FILE_PROCESSING_ERROR':
          logger.error('File processing failed', errorContext);
          break;
        default:
          logger.error('Knowledge graph processing error', errorContext);
      }
    } else {
      logger.error('Unexpected error', errorContext);
    }
  }

  /**
   * Wrap async operations with error handling
   */
  static async withErrorHandling<T>(
    operation: () => Promise<T>,
    errorContext: Record<string, any>,
    logger?: any
  ): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      const enhancedError = this.enhanceError(error as Error, errorContext);
      
      if (logger) {
        this.logError(enhancedError, logger, errorContext);
      }
      
      throw enhancedError;
    }
  }

  /**
   * Enhance an error with additional context
   */
  static enhanceError(error: Error, context: Record<string, any>): Error {
    if (error instanceof KnowledgeGraphError) {
      return error; // Already enhanced
    }

    // Convert common errors to specific types
    if (error.message.includes('ENOENT') || error.message.includes('file not found')) {
      return new FileProcessingError(
        error.message,
        context.filePath || 'unknown',
        'File not found'
      );
    }

    if (error.message.includes('ECONNREFUSED') || error.message.includes('fetch failed')) {
      return new NetworkError(
        error.message,
        context.url || context.host || 'unknown'
      );
    }

    if (error.message.includes('timeout')) {
      return new TimeoutError(
        error.message,
        context.operation || 'unknown',
        context.timeout || 30000
      );
    }

    // Return generic KG error for unknown types
    return new KnowledgeGraphGenerationError(error.message, context);
  }
}

/**
 * Result wrapper for operations that might fail
 */
export type Result<T, E = Error> = {
  success: true;
  data: T;
} | {
  success: false;
  error: E;
};

/**
 * Utility functions for working with Results
 */
export class ResultUtils {
  /**
   * Create a successful result
   */
  static ok<T>(data: T): Result<T> {
    return { success: true, data };
  }

  /**
   * Create a failed result
   */
  static err<E extends Error>(error: E): Result<never, E> {
    return { success: false, error };
  }

  /**
   * Convert a throwing operation to a Result
   */
  static async fromAsync<T>(operation: () => Promise<T>): Promise<Result<T>> {
    try {
      const data = await operation();
      return this.ok(data);
    } catch (error) {
      return this.err(error as Error);
    }
  }

  /**
   * Map over a successful result
   */
  static map<T, U>(result: Result<T>, fn: (data: T) => U): Result<U> {
    if (result.success) {
      return this.ok(fn(result.data));
    }
    return result;
  }

  /**
   * Chain operations on results
   */
  static async chain<T, U>(
    result: Result<T>,
    fn: (data: T) => Promise<Result<U>>
  ): Promise<Result<U>> {
    if (result.success) {
      return await fn(result.data);
    }
    return result;
  }

  /**
   * Unwrap a result or throw the error
   */
  static unwrap<T>(result: Result<T>): T {
    if (result.success) {
      return result.data;
    }
    throw result.error;
  }

  /**
   * Unwrap a result or return a default value
   */
  static unwrapOr<T>(result: Result<T>, defaultValue: T): T {
    if (result.success) {
      return result.data;
    }
    return defaultValue;
  }
}

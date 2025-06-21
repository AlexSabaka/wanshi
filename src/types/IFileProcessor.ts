import { ChunkingOptions, ProcessedFile } from './IProcessingService';

/**
 * Interface for File Processing services
 */

export interface IFileProcessor {
  /**
   * Process a single file
   */
  processFile(filePath: string): Promise<ProcessedFile>;

  /**
   * Check if a file type is supported
   */
  canProcess(filePath: string): boolean;
}

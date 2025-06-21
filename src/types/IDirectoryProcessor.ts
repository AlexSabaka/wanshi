import { ProcessingOptions } from './ProcessingOptions';

/**
 * Interface for Directory Processing
 */

export interface IDirectoryProcessor {
  /**
   * Process a directory and generate knowledge graphs
   */
  processDirectory(options: ProcessingOptions): Promise<void>;
}

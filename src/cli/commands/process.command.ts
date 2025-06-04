import { DirectoryProcessor } from '../../core/DirectoryProcessor';
import { ProcessingOptions } from '../../types/ProcessingOptions';
import { logger } from '../../shared/logger';

/**
 * Process command - handles one-time directory processing
 */
export async function processCommand(options: ProcessingOptions): Promise<void> {
  try {
    const processor = new DirectoryProcessor(options);
    await processor.processDirectory(options);
  } catch (error) {
    logger.error(`Process command failed: ${error}`);
    throw error;
  }
}
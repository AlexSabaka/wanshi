import { ContainerFactory, DIContainer } from '../../core/di';
import { DirectoryProcessor } from '../../core/DirectoryProcessor';
import { logger } from '../../shared/logger';
import { ProcessingOptions } from '../../types';

/**
 * Process command - handles one-time directory processing
 */
export async function processCommand(options: ProcessingOptions): Promise<void> {
  try {
    const processor = new DirectoryProcessor(ContainerFactory.createContainer({ processingOptions: options }));
    await processor.processDirectory(options);
  } catch (error) {
    logger.error(`Process command failed: ${error}`);
    throw error;
  }
}
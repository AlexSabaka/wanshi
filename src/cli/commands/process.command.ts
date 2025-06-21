import { DIContainer, TYPES } from '../../core/di';
import { Logger } from '../../shared';
import { IDirectoryProcessor, ProcessingOptions } from '../../types';

/**
 * Process command - handles one-time directory processing
 */
export async function processCommand(container: DIContainer): Promise<void> {
  const logger = await container.resolve<Logger>(TYPES.Logger);
  const options = await container.resolve<ProcessingOptions>(TYPES.ProcessingOptions);
  const processor = await container.resolve<IDirectoryProcessor>(TYPES.DirectoryProcessor);
  try {
    await processor.processDirectory(options);
  } catch (error) {
    logger.error(`Process command failed: ${error}`);
    throw error;
  }
}
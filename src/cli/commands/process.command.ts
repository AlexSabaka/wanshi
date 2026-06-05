import { DIContainer, TYPES } from '../../core/di';
import { Logger, shutdown } from '../../shared';
import { IDirectoryProcessor, ProcessingOptions } from '../../types';

/** EOT byte (0x04) sent by Ctrl+D at a TTY. */
const EOT = String.fromCharCode(4);

/**
 * Process command - handles one-time directory processing.
 *
 * Installs graceful-interrupt handlers: the first Ctrl+C / Ctrl+D (or SIGTERM)
 * requests a cooperative shutdown — the run finishes the in-flight chunk,
 * checkpoints it, and flushes a partial graph. A second interrupt force-quits.
 */
export async function processCommand(container: DIContainer): Promise<void> {
  const logger = await container.resolve<Logger>(TYPES.Logger);
  const options = await container.resolve<ProcessingOptions>(TYPES.ProcessingOptions);
  const processor = await container.resolve<IDirectoryProcessor>(TYPES.DirectoryProcessor);

  const cleanup = installShutdownHandlers(logger);
  try {
    await processor.processDirectory(options);
  } catch (error) {
    logger.error(`Process command failed: ${error}`);
    throw error;
  } finally {
    cleanup();
  }
}

/**
 * Wire SIGINT/SIGTERM (and best-effort Ctrl+D via stdin EOT) to the cooperative
 * shutdown flag. Returns a cleanup function that removes the listeners so the
 * process can exit normally after a completed run.
 */
function installShutdownHandlers(logger: Logger): () => void {
  let interrupts = 0;

  const onInterrupt = () => {
    interrupts += 1;
    if (interrupts >= 2) {
      logger.warn('Second interrupt — force quitting.');
      process.exit(130);
    }
    logger.warn(
      'Interrupt received — finishing the current chunk, then flushing a partial graph. Press Ctrl+C again to force quit.'
    );
    shutdown.request();
  };

  const onStdinData = (data: Buffer | string) => {
    if (data.toString().includes(EOT)) onInterrupt();
  };

  process.on('SIGINT', onInterrupt);
  process.on('SIGTERM', onInterrupt);

  const stdin = process.stdin;
  const tty = (stdin as NodeJS.ReadStream).isTTY;
  if (tty) {
    stdin.on('data', onStdinData);
    stdin.on('end', onInterrupt);
    // Don't let the stdin listener keep the event loop alive after we finish.
    stdin.unref?.();
  }

  return () => {
    process.removeListener('SIGINT', onInterrupt);
    process.removeListener('SIGTERM', onInterrupt);
    if (tty) {
      stdin.removeListener('data', onStdinData);
      stdin.removeListener('end', onInterrupt);
    }
  };
}

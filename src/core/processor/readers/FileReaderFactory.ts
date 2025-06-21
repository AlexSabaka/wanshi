import { FileReader } from './FileReader';
import { Logger } from '../../../shared';

/**
 * Factory for creating appropriate file readers based on file type
 */
export class FileReaderFactory {
  private readers: FileReader[] = [];

  constructor(private logger: Logger) { }

  /**
   * Get appropriate reader for a file
   * @param filePath Path to the file
   * @returns FileReader instance or null if no reader supports the file
   */
  getReader(filePath: string): FileReader | null {
    for (const reader of this.readers) {
      if (reader.canRead(filePath)) {
        this.logger.debug(`Using ${reader.getName()} for file: ${filePath}`);
        return reader;
      }
    }
    
    this.logger.warn(`No reader found for file: ${filePath}`);
    return null;
  }

  /**
   * Register a custom reader
   * @param reader Custom FileReader implementation
   */
  registerReader(reader: FileReader): void {
    this.readers.push(reader);
    this.logger.info(`Registered custom reader: ${reader.getName()}`);
  }

  /**
   * Get all registered readers
   */
  getReaders(): FileReader[] {
    return [...this.readers];
  }

  /**
   * Check if any reader supports the file
   */
  canRead(filePath: string): boolean {
    return this.getReader(filePath) !== null;
  }
}
import { FileReader } from './FileReader';
import { TextReader } from './TextReader';
import { ImageReader } from './ImageReader';
import { PdfReader } from './PdfReader';
import { logger } from '../../../shared/logger';

/**
 * Factory for creating appropriate file readers based on file type
 */
export class FileReaderFactory {
  private static readers: FileReader[] = [
    new TextReader(),
    new ImageReader(),
    new PdfReader()
  ];

  /**
   * Get appropriate reader for a file
   * @param filePath Path to the file
   * @returns FileReader instance or null if no reader supports the file
   */
  static getReader(filePath: string): FileReader | null {
    for (const reader of this.readers) {
      if (reader.canRead(filePath)) {
        logger.debug(`Using ${reader.getName()} for file: ${filePath}`);
        return reader;
      }
    }
    
    logger.warn(`No reader found for file: ${filePath}`);
    return null;
  }

  /**
   * Register a custom reader
   * @param reader Custom FileReader implementation
   */
  static registerReader(reader: FileReader): void {
    this.readers.push(reader);
    logger.info(`Registered custom reader: ${reader.getName()}`);
  }

  /**
   * Get all registered readers
   */
  static getReaders(): FileReader[] {
    return [...this.readers];
  }

  /**
   * Check if any reader supports the file
   */
  static canRead(filePath: string): boolean {
    return this.getReader(filePath) !== null;
  }
}
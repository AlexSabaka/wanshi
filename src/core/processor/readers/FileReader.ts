import { Buffer } from 'buffer';
import * as path from 'path';
import { logger } from '../../../shared/logger';

/**
 * Result of file reading operation
 */
export interface FileReadResult {
  content: string;
  images?: Buffer[];
  metadata?: Record<string, any>;
}

/**
 * Abstract base class for file readers
 * Each file type should implement its own reader
 */
export abstract class FileReader {
  protected readonly supportedExtensions: string[];

  constructor(supportedExtensions: string[]) {
    this.supportedExtensions = supportedExtensions.map(ext => ext.toLowerCase());
  }

  /**
   * Check if this reader supports the given file
   */
  canRead(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase();
    return this.supportedExtensions.includes(ext);
  }

  /**
   * Read and process the file
   */
  abstract read(filePath: string): Promise<FileReadResult>;

  /**
   * Get a descriptive name for this reader
   */
  abstract getName(): string;

  /**
   * Validate file before reading
   */
  protected async validateFile(filePath: string): Promise<void> {
    if (!this.canRead(filePath)) {
      throw new Error(
        `${this.getName()} does not support file extension: ${path.extname(filePath)}`
      );
    }
  }
}
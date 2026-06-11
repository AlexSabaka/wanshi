import { Buffer } from 'buffer';
import * as path from 'path';
import { Logger } from '../../../shared';
import { ChunkProvenance } from '../../../types';
import { TextChunker } from '../chunking';

/**
 * Result of file reading operation
 */
export interface FileReadResult {
  chunks: ChunkResult[];
  metadata?: Record<string, any>;
}

export interface ChunkResult {
  content: string;
  images?: ImageResult[];
  index: number;
  totalChunks: number;
  startOffset: number;
  endOffset: number;
  /** Reader-supplied provenance (e.g. transcript turn speaker/time). */
  provenance?: ChunkProvenance;
}

export interface ImageResult {
  path?: string;
  alt?: string;
  buffer?: Buffer;
}

/**
 * Abstract base class for file readers
 * Each file type should implement its own reader
 */
export abstract class FileReader {
  protected readonly supportedExtensions: string[];
  protected readonly chunker: TextChunker;
  protected readonly logger: Logger;

  constructor(supportedExtensions: string[], chunker: TextChunker, logger: Logger) {
    this.logger = logger;
    this.chunker = chunker;
    this.supportedExtensions = supportedExtensions.map(ext => ext.toLowerCase());
  }

  /**
   * Check if this reader supports the given file
   */
  canRead(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase();
    const base = path.basename(filePath).toLowerCase();
    // Exact match on the extension (".ts") or, for extensionless / named files
    // (Makefile, Dockerfile, LICENSE), the full basename. Never a prefix match:
    // `startsWith` plus an empty-string entry once let TextReader claim every
    // file (so .mp3/.wav read as UTF-8 and the ASR path was unreachable).
    return this.supportedExtensions.some(e => e !== '' && (ext === e || base === e));
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
        `${this.getName()} does not support file extension: ${path.extname(filePath)}, supported extensions are ${this.supportedExtensions.join(', ')}`
      );
    }
  }
}
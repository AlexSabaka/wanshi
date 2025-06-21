import * as path from "path";
import { ChunkingOptions, IFileProcessor, ProcessedChunk, ProcessedFile, ProcessedImage } from "../../types";
import { TextChunker } from "./chunking";
import { FileReaderFactory } from "./readers";
import { Logger } from "../../shared";

/**
 * Main file processor that coordinates reading and chunking
 */
export class FileProcessor implements IFileProcessor {
  private readonly readerFactory: FileReaderFactory;
  private readonly logger: Logger;

  constructor(readerFactory: FileReaderFactory, logger: Logger) {
    this.readerFactory = readerFactory;
    this.logger = logger;
  }

  /**
   * Process a single file - read and optionally chunk it
   */
  async processFile(
    filePath: string,
  ): Promise<ProcessedFile> {
    this.logger.info(`Processing file: ${filePath}`);

    // Get appropriate reader
    const reader = this.readerFactory.getReader(filePath);
    if (!reader) {
      this.logger.warn(`No reader available for file: ${filePath}`);
      return {
        chunks: [],
        path: filePath,
        metadata: {
          error: "No reader available",
          fileType: path.extname(filePath),
        },
      };
    }

    try {
      // Read the file
      const readResult = await reader.read(filePath);

      // Return unchunked result
      return {
        path: filePath,
        chunks: readResult.chunks.map((chunk) => {
          return {
            content: chunk.content,
            index: chunk.index,
            totalChunks: chunk.totalChunks,
            startOffset: chunk.startOffset,
            endOffset: chunk.endOffset,
            images: chunk.images?.map((image) => {
              return {
                path: image.path,
                caption: image.alt,
                base64: image.buffer?.toString("base64"),
              } as ProcessedImage;
            }),
          } as ProcessedChunk;
        }),
        metadata: {
          ...readResult.metadata,
          chunked: false,
        },
      };
    } catch (error) {
      this.logger.error(`Failed to process file ${filePath}: ${error}`);
      throw new Error(`Failed to process file ${filePath}: ${error}`);
    }
  }

  /**
   * Process multiple files in parallel
   */
  async processFiles(
    filePaths: string[],
    concurrency: number = 5
  ): Promise<ProcessedFile[]> {
    this.logger.info(
      `Processing ${filePaths.length} files with concurrency ${concurrency}`
    );

    const results: ProcessedFile[] = [];
    const queue = [...filePaths];
    const inProgress: Promise<ProcessedFile>[] = [];

    while (queue.length > 0 || inProgress.length > 0) {
      // Start new tasks up to concurrency limit
      while (inProgress.length < concurrency && queue.length > 0) {
        const filePath = queue.shift()!;
        inProgress.push(this.processFile(filePath));
      }

      // Wait for at least one task to complete
      if (inProgress.length > 0) {
        const result = await Promise.race(inProgress);
        results.push(result);

        // Remove completed task
        const index = inProgress.findIndex(async (p) => (await p) === result);
        if (index !== -1) {
          inProgress.splice(index, 1);
        }
      }
    }

    this.logger.info(`Processed ${results.length} files successfully`);
    return results;
  }

  /**
   * Check if a file can be processed
   */
  canProcess(filePath: string): boolean {
    return this.readerFactory.canRead(filePath);
  }
}

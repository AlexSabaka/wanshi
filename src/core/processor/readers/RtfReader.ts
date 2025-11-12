import { FileReader, FileReadResult } from "./FileReader";
import path from "path";
import fs from "fs/promises";
import { Logger } from "../../../shared";
import { TextChunker } from "../chunking";
import { readRtf } from "../../../shared";

/**
 * Reader for Rich Text Format (RTF) documents
 * 
 * Uses the rtf-parser npm package to extract text content from RTF files.
 * RTF documents can contain rich formatting, images, and other elements,
 * but this reader focuses on extracting plain text content for indexing.
 * 
 * Supported formats: .rtf
 * 
 * npm install rtf-parser
 */
export class RtfReader extends FileReader {
  constructor(chunker: TextChunker, logger: Logger) {
    super([".rtf"], chunker, logger);
  }

  getName(): string {
    return "RtfReader";
  }

  async read(filePath: string): Promise<FileReadResult> {
    await this.validateFile(filePath);

    try {
      this.logger.debug(`Reading RTF file: ${filePath}`);

      // Get file stats for basic metadata
      const stats = await fs.stat(filePath);

      // Parse RTF content using rtf-parser
      const { text, info } = await readRtf(filePath);

      // Chunk the extracted text
      const chunks = await this.chunker.chunk(text);

      // Convert to ChunkResult format
      const chunkResults = chunks.map(chunk => ({
        content: chunk.content,
        startOffset: chunk.startOffset,
        endOffset: chunk.endOffset,
        index: chunk.index,
        totalChunks: chunk.totalChunks,
      }));

      // Build metadata object
      const metadata = {
        type: "rtf_document",
        description: "Rich Text Format Document",
        fileName: path.basename(filePath),
        filePath: filePath,
        fileSize: stats.size,
        createdAt: stats.birthtime.toISOString(),
        modifiedAt: stats.mtime.toISOString(),
        accessedAt: stats.atime.toISOString(),
        extension: ".rtf",
        status: "success",
        extractedTextLength: text.length,
        hasContent: text.trim().length > 0,
        documentInfo: info,
      };

      this.logger.debug(
        `Successfully extracted ${text.length} characters from RTF file ${filePath}`
      );

      return {
        chunks: chunkResults,
        metadata: metadata,
      };
    } catch (error: any) {
      this.logger.error(
        `Failed to read RTF file ${filePath}: ${error.message}`
      );

      // Return error result instead of throwing
      return {
        chunks: [
          {
            content: "",
            startOffset: 0,
            endOffset: 0,
            index: 1,
            totalChunks: 1,
          },
        ],
        metadata: {
          type: "rtf_document",
          description: "Rich Text Format Document",
          fileName: path.basename(filePath),
          filePath: filePath,
          status: "error",
          error: error.message,
          errorType: error.name,
        },
      };
    }
  }
}

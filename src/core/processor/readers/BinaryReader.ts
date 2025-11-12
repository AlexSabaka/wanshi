import * as fs from "fs";
import * as path from "path";
import { FileReader, FileReadResult } from "./FileReader";
import { Logger } from "../../../shared";
import { TextChunker } from "../chunking";

/**
 * Reader for image files
 * Returns a placeholder text and the image buffer for multimodal processing
 */
export class BinaryReader extends FileReader {
  constructor(chunker: TextChunker, logger: Logger) {
    super(
      [
        ".bin",
        ".dat",
        ".exe",
        ".dll",
        ".so",
        ".dylib",
        ".o",
        ".a",
        ".lib",
        ".class",
        ".jar",
        ".wasm",
      ],
      chunker,
      logger
    );
  }

  getName(): string {
    return "BinaryReader";
  }

  async read(filePath: string): Promise<FileReadResult> {
    await this.validateFile(filePath);

    try {
      this.logger.debug(`Reading binary file: ${filePath}`);
      const fileBuffer = await fs.promises.readFile(filePath);
      const fileName = path.basename(filePath);
      const stats = await fs.promises.stat(filePath);

      return {
        chunks: [
          {
            content: `[Image file: ${fileName}]`,
            index: 1,
            totalChunks: 1,
            startOffset: 0,
            endOffset: fileBuffer.length,
            images: [],
          },
        ],
        metadata: {
          type: "image",
          fileName,
          size: stats.size,
          extension: path.extname(filePath).toLowerCase(),
        },
      };
    } catch (error) {
      this.logger.error(`Failed to read binary file ${filePath}: ${error}`);
      throw new Error(`Failed to read binary file: ${error}`);
    }
  }
}

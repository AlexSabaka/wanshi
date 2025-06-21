import * as fs from "fs";
import * as path from "path";
import { FileReader, FileReadResult } from "./FileReader";
import { Logger } from "../../../shared";
import { TextChunker } from "../chunking";

/**
 * Reader for image files
 * Returns a placeholder text and the image buffer for multimodal processing
 */
export class ImageReader extends FileReader {
  constructor(chunker: TextChunker, logger: Logger) {
    super(
      [
        ".jpg",
        ".jpeg",
        ".jpe",
        ".jif",
        ".jfif",
        ".jfi",
        ".png",
        ".gif",
        ".webp",
        ".tiff",
        ".tif",
        ".bmp",
        ".dib",
        ".svg",
        ".svgz",
        ".ico",
        ".cur",
        ".pbm",
        ".pgm",
        ".ppm",
        ".pnm",
        ".heif",
        ".heic",
        ".avif",
        ".apng",
      ],
      chunker,
      logger
    );
  }

  getName(): string {
    return "ImageReader";
  }

  async read(filePath: string): Promise<FileReadResult> {
    await this.validateFile(filePath);

    try {
      this.logger.debug(`Reading image file: ${filePath}`);
      const imageBuffer = await fs.promises.readFile(filePath);
      const fileName = path.basename(filePath);
      const stats = await fs.promises.stat(filePath);

      return {
        chunks: [
          {
            content: `[Image file: ${fileName}]`,
            index: 1,
            totalChunks: 1,
            startOffset: 0,
            endOffset: imageBuffer.length,
            images: [{ path: fileName, buffer: imageBuffer }],
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
      this.logger.error(`Failed to read image file ${filePath}: ${error}`);
      throw new Error(`Failed to read image file: ${error}`);
    }
  }
}

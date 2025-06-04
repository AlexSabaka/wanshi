import * as fs from 'fs';
import * as path from 'path';
import { FileReader, FileReadResult } from './FileReader';
import { logger } from '../../../shared/logger';

/**
 * Reader for image files
 * Returns a placeholder text and the image buffer for multimodal processing
 */
export class ImageReader extends FileReader {
  constructor() {
    super([
      '.jpg', '.jpeg', '.jpe', '.jif', '.jfif', '.jfi',
      '.png', '.gif', '.webp', '.tiff', '.tif',
      '.bmp', '.dib', '.svg', '.svgz',
      '.ico', '.cur',
      '.pbm', '.pgm', '.ppm', '.pnm',
      '.heif', '.heic',
      '.avif', '.apng'
    ]);
  }

  getName(): string {
    return 'ImageReader';
  }

  async read(filePath: string): Promise<FileReadResult> {
    await this.validateFile(filePath);
    
    try {
      logger.debug(`Reading image file: ${filePath}`);
      const imageBuffer = await fs.promises.readFile(filePath);
      const fileName = path.basename(filePath);
      const stats = await fs.promises.stat(filePath);
      
      return {
        content: `[Image file: ${fileName}]`,
        images: [imageBuffer],
        metadata: {
          type: 'image',
          fileName,
          size: stats.size,
          extension: path.extname(filePath).toLowerCase()
        }
      };
    } catch (error) {
      logger.error(`Failed to read image file ${filePath}: ${error}`);
      throw new Error(`Failed to read image file: ${error}`);
    }
  }
}
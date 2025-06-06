import * as fs from 'fs';
import { FileReader, FileReadResult } from './FileReader';
import { logger } from '../../../shared/logger';

/**
 * Reader for html text files
 */
export class HtmlReader extends FileReader {
  constructor() {
    super([
      '.html', '.htm', '.xhtml',
    ]);
  }

  getName(): string {
    return 'HtmlReader';
  }

  async read(filePath: string): Promise<FileReadResult> {
    await this.validateFile(filePath);
    
    try {
      logger.debug(`Extracting text from HTML file: ${filePath}`);
      const content = await fs.promises.readFile(filePath, 'utf-8');
      
      // TODO: Implement proper reading
      // 1. Parse HTML
      // 2. Extract main/all text
      // 3. Generate outline with outliner package
      // 4. Return

      return {
        content,
        metadata: {
          type: 'text',
          encoding: 'utf-8',
          size: content.length
        }
      };
    } catch (error) {
      logger.error(`Failed to read text file ${filePath}: ${error}`);
      throw new Error(`Failed to read text file: ${error}`);
    }
  }
}
import { FileReader, FileReadResult } from './FileReader';
import { logger } from '../../../shared/logger';
// TODO: Properly implement PDF reading with pdf-parse or similar library
// import { PdfReader } from "pdfreader";

/**
 * Reader for PDF files
 * TODO: Currently returns empty content - needs proper implementation
 */
export class PdfReader extends FileReader {
  constructor() {
    super(['.pdf']);
  }

  getName(): string {
    return 'PdfReader';
  }

  async read(filePath: string): Promise<FileReadResult> {
    await this.validateFile(filePath);
    
    try {
      logger.debug(`Reading PDF file: ${filePath}`);
      
      // TODO: Implement proper PDF reading
      // Current implementation in process-directory.ts is incomplete
      // Consider using pdf-parse or similar library
      
      logger.warn(`PDF reading not yet implemented for: ${filePath}`);
      
      return {
        content: '', // Empty for now
        metadata: {
          type: 'pdf',
          fileName: filePath,
          status: 'not_implemented'
        }
      };
    } catch (error) {
      logger.error(`Failed to read PDF file ${filePath}: ${error}`);
      throw new Error(`Failed to read PDF file: ${error}`);
    }
  }
}
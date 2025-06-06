import { FileReader, FileReadResult } from "./FileReader";
import { logger } from "../../../shared/logger";

/**
 * Reader for Microsoft Office documents
 */
export class OfficeReader extends FileReader {
  constructor() {
    super([".docx", ".pptx", ".xlsx", ".odt", ".odp", ".ods"]);
  }

  getName(): string {
    return "OfficeReader";
  }

  async read(filePath: string): Promise<FileReadResult> {
    await this.validateFile(filePath);

    try {
      logger.debug(`Reading PDF file: ${filePath}`);

      // TODO: Implement proper reading
      // Current implementation in process-directory.ts is incomplete
      // Consider using pdf-parse or similar library

      logger.warn(`Office documents reading not yet implemented for: ${filePath}`);

      return {
        content: "", // Empty for now
        metadata: {
          type: "",
          fileName: filePath,
          status: "not_implemented",
        },
      };
    } catch (error) {
      logger.error(`Failed to read file ${filePath}: ${error}`);
      throw new Error(`Failed to read file: ${error}`);
    }
  }

  private matchExtensionToDescription(ext: string): string {
    const exts: { [key: string]: string } = {
      ".docx": "MS Office document",
      ".pptx": "MS Office presentation",
      ".xlsx": "MS Office Excel spreadsheet",
      ".odt": "",
      ".odp": "",
      ".ods": "",
    };
    return exts[ext];
  }
}

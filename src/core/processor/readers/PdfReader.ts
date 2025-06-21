import { Logger } from "../../../shared";
import { TextChunker } from "../chunking";
import { FileReader, FileReadResult } from "./FileReader";
import PDFParser from "pdf2json";

/**
 * Reader for PDF files
 */
export class PdfReader extends FileReader {
  constructor(chunker: TextChunker, logger: Logger) {
    super([".pdf"], chunker, logger);
  }

  getName(): string {
    return "PdfReader";
  }

  async read(filePath: string): Promise<FileReadResult> {
    await this.validateFile(filePath);

    try {
      this.logger.debug(`Reading PDF file: ${filePath}`);

      const content = await this.readPdfPages(filePath);
      const chunks = content.map((page, index) => {
        const startOffset = content.slice(0, index).reduce((acc, curr) => acc + curr.length, 0);
        return {
          content: page,
          startOffset: startOffset,
          endOffset: startOffset + page.length,
          index: index + 1,
          totalChunks: content.length
        };
      });

      return {
        chunks: chunks,
        metadata: {
          type: "pdf",
          fileName: filePath,
        },
      };
    } catch (error) {
      this.logger.error(`Failed to read PDF file ${filePath}: ${error}`);
      throw new Error(`Failed to read PDF file: ${error}`);
    }
  }

  private readPdfPages(filePath: string): Promise<string[]> {
    return new Promise((resolve, reject) => {
      const pdfParser = new PDFParser();

      pdfParser.on("pdfParser_dataError", (errData) =>
        reject(errData.parserError)
      );

      pdfParser.on("pdfParser_dataReady", (pdfData) => {
        const pages = pdfData.Pages.map((page) =>
          page.Texts.map((t) =>
            t.R.map((r) => decodeURIComponent(r.T)).join("")
          ).join("\n")
        );
        resolve(pages);
      });

      pdfParser.loadPDF(filePath);
    });
  }
}

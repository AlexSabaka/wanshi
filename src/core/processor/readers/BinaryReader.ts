import * as path from "path";
import { FileReader, FileReadResult } from "./FileReader";
import { Logger } from "../../../shared";
import { TextChunker } from "../chunking";

/**
 * Final-fallback reader: the catch-all for binary / unknown files.
 *
 * Registered LAST in the factory, it claims anything no specific reader
 * recognized (overriding `canRead` to always match) and produces *no* chunks —
 * so binaries are skipped gracefully instead of being read as UTF-8 mojibake and
 * shipped to the LLM. The carried extension list is documentation of the obvious
 * binary types; routing relies on the catch-all `canRead`, not the list.
 */
export class BinaryReader extends FileReader {
  constructor(chunker: TextChunker, logger: Logger) {
    super(
      [
        ".bin", ".dat", ".exe", ".dll", ".so", ".dylib",
        ".o", ".a", ".lib", ".class", ".jar", ".wasm",
      ],
      chunker,
      logger
    );
  }

  getName(): string {
    return "BinaryReader";
  }

  /** Catch-all: claims any file that fell through every specific reader. */
  canRead(_filePath: string): boolean {
    return true;
  }

  async read(filePath: string): Promise<FileReadResult> {
    const fileName = path.basename(filePath);
    // No bytes read, no LLM call — emit zero chunks and flag a graceful skip the
    // pipeline honors before its "no content extracted" guard fires.
    this.logger.info(`Skipping binary / unsupported file: ${fileName}`);
    return {
      chunks: [],
      metadata: {
        type: "binary",
        skip: true,
        fileName,
        extension: path.extname(filePath).toLowerCase(),
      },
    };
  }
}

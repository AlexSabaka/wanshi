import { IStructuredAdapter } from "./IStructuredAdapter";

/**
 * Registry of structured-emit adapters, mirroring `FileReaderFactory`: first
 * registered adapter that claims a file wins. Empty by default — concrete
 * adapters (SQLite, OpenAPI, iCal, …) register against it in their own briefs, so
 * a normal run is unaffected until one is enabled.
 *
 * Resolved in `DirectoryProcessor.processFile`: a matched adapter's fragment is
 * emitted directly into the per-file `graphs[]` union (the same union the AST seed
 * and reference graph use), bypassing the LLM read→build path for that file.
 */
export class StructuredAdapterRegistry {
  private adapters: IStructuredAdapter[] = [];

  register(adapter: IStructuredAdapter): void {
    this.adapters.push(adapter);
  }

  /** The first adapter (registration order) that claims the file, else null. */
  match(filePath: string): IStructuredAdapter | null {
    return this.adapters.find((a) => a.canHandle(filePath)) ?? null;
  }

  get size(): number {
    return this.adapters.length;
  }
}

import { KnowledgeGraph } from "../../types/KnowledgeGraph";

/**
 * A **structured-emit adapter**: maps a graph-native source (a SQLite `.db`, an
 * OpenAPI spec, an `.ics` calendar, …) DIRECTLY into graph fragments
 * (entities/relations), bypassing the LLM extractor — near-lossless and
 * hallucination-free. The "structured source → emit graph → merge" mapping path
 * (the other being unstructured text → LLM-extract).
 *
 * The emitted fragment still goes through the normal merge/canon stage (so a
 * SQLite `Author` reconciles with a prose-extracted `author`). Adapters stamp
 * `sourceAdapter: id` + a `locator` (e.g. "table:parts/row:42") onto the
 * `Observation`s they emit, so every fact stays attributable (ECS source-tagging).
 */
export interface IStructuredAdapter {
  /** Source-adapter id stamped onto emitted observations, e.g. "sqlite". */
  readonly id: string;

  /** Whether this adapter maps the given file directly to graph fragments. */
  canHandle(filePath: string): boolean;

  /**
   * Map the source to a graph fragment. Returns `null` when there is nothing to
   * emit (and the file then falls through to the normal reader/LLM path).
   */
  extract(filePath: string): Promise<KnowledgeGraph | null>;
}

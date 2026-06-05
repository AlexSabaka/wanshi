import * as crypto from "crypto";
import { KnowledgeGraph } from "../../../types/KnowledgeGraph";
import { obsText } from "../../../types/Observation";
import { ProcessingOptions } from "../../../types/ProcessingOptions";
import { IExportStrategy } from "./IExportStrategy";

/**
 * Emits a graph in Graphiti's `add_triplet` shape — `{ nodes: EntityNode[],
 * edges: EntityEdge[] }` — the bi-temporal ingestion target.
 *
 * Mapping: entities → EntityNodes (summary = their observations); relations →
 * EntityEdges carrying transaction time (`created_at`). Per-fact valid-time lives
 * on observations and is exported in full via `json`/`kblam`; Graphiti here gets
 * the structural+relational view (fact-as-temporal-edge is a future refinement).
 */
export class GraphitiExportStrategy implements IExportStrategy {
  export(graph: KnowledgeGraph, _options?: ProcessingOptions): string {
    const now = new Date().toISOString();

    const nodes = new Map<string, any>();
    const ensureNode = (name: string, entityType?: string, observations?: any[]) => {
      if (nodes.has(name)) return;
      nodes.set(name, {
        uuid: this.uuid(name),
        name,
        summary: (observations || []).map(obsText).slice(0, 10).join(" "),
        labels: entityType ? [entityType] : [],
        created_at: this.earliestCreatedAt(observations) ?? now,
      });
    };

    for (const e of graph.entities) {
      ensureNode(e.name, e.entityType, e.observations);
    }

    const edges: any[] = [];
    for (const r of graph.relations) {
      const types = Array.isArray(r.relationType) ? r.relationType : [r.relationType];
      for (const t of types) {
        if (!t) continue;
        ensureNode(r.from);
        ensureNode(r.to);
        edges.push({
          uuid: this.uuid(`${r.from}|${t}|${r.to}`),
          name: this.upperSnake(String(t)),
          fact: `${r.from} ${t} ${r.to}`,
          source_node_uuid: this.uuid(r.from),
          target_node_uuid: this.uuid(r.to),
          created_at: now,
          // valid_at / invalid_at: kg-gen relations carry no edge-level valid time yet
        });
      }
    }

    return JSON.stringify({ nodes: Array.from(nodes.values()), edges }, null, 2);
  }

  getFormat(): string {
    return "graphiti";
  }

  supportsFormat(format: string): boolean {
    return format === "graphiti";
  }

  private uuid(seed: string): string {
    const h = crypto.createHash("sha1").update(seed).digest("hex");
    // format as a uuid-ish string for stable, deterministic node identity
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
  }

  private upperSnake(s: string): string {
    return s
      .trim()
      .replace(/[^A-Za-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .toUpperCase();
  }

  private earliestCreatedAt(observations?: any[]): string | undefined {
    const times = (observations || [])
      .map((o) => (typeof o === "object" ? o.createdAt : undefined))
      .filter((t): t is string => typeof t === "string")
      .sort();
    return times[0];
  }
}

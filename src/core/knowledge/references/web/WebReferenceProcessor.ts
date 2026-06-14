import * as fs from "fs";
import { Entity, KnowledgeGraph, Observation, Relation } from "../../../../types";
import { Logger } from "../../../../shared";
import { isExternalTarget, RawLink } from "../../../processor/readers/referenceExtraction";
import { GatedFetcher } from "./GatedFetcher";
import { FetchCacheService } from "./FetchCacheService";

/** Extract a KG from a staged (fetched) page — injected so this stays decoupled
 * from the prompt/builder machinery and unit-testable with a stub. */
export type WebExtractFn = (tempPath: string, sourceUrl: string) => Promise<KnowledgeGraph[]>;

/**
 * Phase-1 class-3 consumer: for a citing document's EXTERNAL links, fetch each
 * (gated), extract the page's KG, and emit a `references` edge `citingDoc → url`.
 * Depth-1 — fetched pages are not re-crawled. Every URL is cached so a re-run
 * never refetches; blocked/gated links emit a bare `resolved:false` edge to a
 * stub URL node (never fabricated content).
 */
export class WebReferenceProcessor {
  constructor(
    private readonly fetcher: GatedFetcher,
    private readonly cache: FetchCacheService,
    private readonly extract: WebExtractFn,
    private readonly logger: Logger
  ) {}

  async process(
    citingRel: string,
    links: RawLink[],
    scope: string
  ): Promise<KnowledgeGraph | null> {
    const urls = Array.from(
      new Set(links.filter((l) => isExternalTarget(l.target)).map((l) => l.target))
    );
    if (urls.length === 0) return null;

    const entities = new Map<string, Entity>();
    const relations: Relation[] = [];
    const seenEdge = new Set<string>();
    const ensureDoc = (name: string, observations: Observation[] = []) => {
      const e = entities.get(name);
      if (e) {
        if (observations.length) e.observations.push(...observations);
        return;
      }
      entities.set(name, { name, entityType: "document", files: [], observations });
    };
    const addEdge = (to: string, resolved: boolean) => {
      if (to === citingRel || seenEdge.has(to)) return;
      seenEdge.add(to);
      relations.push({ from: citingRel, to, relationType: ["references"], source: citingRel, resolved });
    };

    // The citing document node — guarantees the edge's `from` endpoint exists
    // (idempotent with the Phase-0 resolver's path-keyed node).
    ensureDoc(citingRel);

    for (const url of urls) {
      const cached = this.cache.get(url);
      const contribution = cached?.graph ?? (await this.fetchAndBuild(citingRel, url, scope));
      // Merge this URL's contribution (page entities + url node + edge) in.
      for (const e of contribution.entities) ensureDoc(e.name, e.observations);
      for (const r of contribution.relations) {
        if (r.relationType.includes("references")) addEdge(r.to, r.resolved ?? false);
        else relations.push(r);
      }
    }

    return relations.length || entities.size > 1 ? { entities: Array.from(entities.values()), relations } : null;
  }

  /** Fetch + extract one URL, build its contribution graph, and cache it. */
  private async fetchAndBuild(
    citingRel: string,
    url: string,
    scope: string
  ): Promise<KnowledgeGraph> {
    const fetchedAt = new Date().toISOString();
    const r = await this.fetcher.fetch(url, scope);

    let graph: KnowledgeGraph;
    if (r.resolved && r.tempPath) {
      let pageGraphs: KnowledgeGraph[] = [];
      try {
        pageGraphs = await this.extract(r.tempPath, url);
      } catch (err) {
        this.logger.warn(`Web extraction failed for ${url}: ${err}`);
      } finally {
        fs.promises.unlink(r.tempPath).catch(() => undefined);
      }
      graph = this.buildContribution(citingRel, url, true, pageGraphs, r.title, fetchedAt);
    } else {
      this.logger.info(`Web reference not resolved (${r.reason}): ${url}`);
      graph = this.buildContribution(citingRel, url, false, [], undefined, fetchedAt);
    }

    await this.cache.append({
      url,
      resolved: r.resolved,
      reason: r.reason,
      status: r.status,
      contentType: r.contentType,
      fetchedAt,
      graph,
    });
    return graph;
  }

  /** Assemble: url document node (+ stated provenance) + page content (source
   * re-stamped to the URL) + the `references` edge. */
  private buildContribution(
    citingRel: string,
    url: string,
    resolved: boolean,
    pageGraphs: KnowledgeGraph[],
    title: string | undefined,
    fetchedAt: string
  ): KnowledgeGraph {
    const entities: Entity[] = [];
    const relations: Relation[] = [
      { from: citingRel, to: url, relationType: ["references"], source: citingRel, resolved },
    ];

    const obs: Observation[] = [];
    if (title) obs.push({ text: `Title: ${title}`, source: url, createdAt: fetchedAt });
    obs.push({ text: `Fetched from ${url}`, source: url, createdAt: fetchedAt });
    entities.push({ name: url, entityType: "document", files: [], observations: obs });

    // Fold in the fetched page's extracted KG, re-stamping observation provenance
    // from the temp path to the URL (the page's true source).
    for (const g of pageGraphs) {
      for (const e of g.entities) {
        entities.push({
          ...e,
          observations: e.observations.map((o) => ({ ...o, source: url })),
        });
      }
      relations.push(...g.relations);
    }
    return { entities, relations };
  }
}

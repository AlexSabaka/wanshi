import * as fs from "fs";
import { Entity, KnowledgeGraph, Observation, Relation, IEmbeddingProvider, IGroundingChecker } from "../../../../types";
import { Logger } from "../../../../shared";
import { cosineSimilarity, jaroWinklerSimilarity } from "../../../../shared/utils";
import { RawCitation } from "../../../processor/readers/referenceExtraction";
import { citationNodeName, citationObservations } from "../ReferenceResolver";
import { GatedFetcher } from "../web/GatedFetcher";
import { FetchCacheService, isTransientFetchReason } from "../web/FetchCacheService";
import { CitationResolver, ResolvableCitation } from "./CitationResolver";

/**
 * One cited work to resolve: its hard ids/title, plus (Phase 2b, GROBID only) the
 * in-text sentence that cites it — the claim faithfulness is checked against.
 */
export interface CitationContext {
  ids: ResolvableCitation;
  citingClaim?: string;
  /** True when the citing sentence cites ONLY this work (Phase 2c). A multi-cite
   * sentence makes a collective claim not attributable to one work, so we don't
   * assert a faithfulness label for it. Undefined ⇒ unknown (regex path). */
  soleReferent?: boolean;
  raw: string;
}

/** Extract a staged (fetched) cited PDF: its chunk texts (for span-select) AND the
 * KG built from it (folded onto the cited-work node). Injected so this stays
 * decoupled from the reader/builder machinery and unit-testable with a stub. */
export type CitationExtractFn = (
  tempPath: string,
  sourceUrl: string
) => Promise<{ chunks: string[]; graphs: KnowledgeGraph[] }>;

/** GROBID seam (Phase 2b): citing PDF → marker-linked citation contexts. */
export interface IGrobidClient {
  process(filePath: string): Promise<CitationContext[]>;
}

export interface CitationEvidenceDeps {
  /** Phase 2b — marker→entry linker; null ⇒ regex citations only (no claim/span). */
  grobid?: IGrobidClient | null;
  /** Phase 2c — faithfulness checker (MiniCheck); null ⇒ no labels. */
  faithfulness?: IGroundingChecker | null;
  /** Phase 2c — [lo, hi]: score ≤lo unsupported, ≥hi supported, between uncertain. */
  uncertainBand?: [number, number];
}

const FAITH = "Citation faithfulness";

/** A references/bibliography section heading on its own line. Mirrors the
 * `REF_HEADING` used by `stripReferences.splitPagesAtReferences`. */
const REF_HEADING_LINE = /^\s*(?:#{0,6}\s*)?(?:[\divxlc]+\.?\s+)?(references|bibliography|works cited)\s*:?\s*$/i;

/**
 * Drop the cited work's bibliography so span-select ranks its BODY, not its
 * reference entries. A citing claim is supported by prose, never by a reference
 * line — yet ref chunks are dense with years/venues/names and out-compete body
 * chunks on the embedding match (the live-probe failure: every span landed on the
 * cited work's reference list → uniformly `unsupported`).
 *
 * Two passes, mirroring `splitPagesAtReferences`: (1) cut the TRAILING reference
 * section at a `References`/`Bibliography` heading in the latter 60% — robust to
 * any entry format (numbered, author-year, GitHub-URL, …) since everything after
 * the heading goes; (2) a density fallback for ref chunks with no clean heading.
 * Falls back to all chunks if a pass would leave nothing. Pure — exported for tests.
 */
export function dropReferenceChunks(chunks: string[]): string[] {
  // (1) trailing-section cut at a references heading past 60% of the document.
  const total = chunks.reduce((n, c) => n + c.length, 0);
  let acc = 0;
  for (let i = 0; i < chunks.length; i++) {
    const start = acc;
    acc += chunks[i].length;
    if (start < total * 0.6) continue; // a body mention of "references" isn't the section
    const lines = chunks[i].split("\n");
    const h = lines.findIndex((l) => REF_HEADING_LINE.test(l.trim()));
    if (h >= 0) {
      const head = lines.slice(0, h).join("\n").trim();
      const kept = chunks.slice(0, i);
      if (head) kept.push(head);
      return kept.length ? kept : chunks;
    }
  }
  // (2) density fallback — ref-dense chunks with no detectable heading line.
  const isRefDense = (t: string): boolean => {
    const per1k = (re: RegExp, w = 1) => ((t.match(re) || []).length * w) / Math.max(t.length / 1000, 1);
    const density =
      per1k(/\b(?:19|20)\d{2}\b/g) +
      per1k(/\bet al\.?/gi, 2) +
      per1k(/In Proceedings|Conference on|Journal of|Transactions on|Advances in Neural|arXiv:\s*\d|doi\.org|URL\s+https?:|github\.com|pp\.\s*\d+/gi, 2);
    return density >= 8;
  };
  const body = chunks.filter((c) => !isRefDense(c));
  return body.length ? body : chunks;
}

/**
 * Split a coarse chunk (PdfReader emits one chunk per PAGE) into focused ~`target`-char
 * passages so span-select — and the MiniCheck evidence — is a paragraph, not a whole
 * page (the live-probe lesson: a page-level span buried the relevant sentence under a
 * results table → `unsupported`). Greedy sentence packing, with a hard split for
 * pdf2json runs that lack spaces/sentence breaks. Pure — exported for tests.
 */
export function splitPassages(text: string, target = 700): string[] {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= target) return clean ? [clean] : [];
  const out: string[] = [];
  let cur = "";
  for (const s of clean.split(/(?<=[.!?])\s+/)) {
    if (cur && cur.length + s.length + 1 > target) {
      out.push(cur);
      cur = s;
    } else {
      cur = cur ? `${cur} ${s}` : s;
    }
    while (cur.length > target * 1.8) {
      out.push(cur.slice(0, target)); // runaway (no sentence breaks) — hard window
      cur = cur.slice(target);
    }
  }
  if (cur.trim()) out.push(cur);
  return out;
}

/**
 * Phase 2 — the citation span-fetch apex. For a citing document's citations:
 * resolve the cited work's id → OA full text (`CitationResolver`), fetch it
 * (PDF-capable `GatedFetcher`), fold the cited work's content onto the SAME
 * `document` node the `cites` edge already names, select the span the citing
 * claim relies on, and label the edge supported/unsupported/uncertain (MiniCheck).
 *
 * The Phase-2 analog of `WebReferenceProcessor`: every cited work is fetched at
 * most once (`FetchCacheService`); a gated/unresolved citation emits a bare
 * `resolved:false` edge to its stated-metadata node — never fabricated content.
 * This processor OWNS `cites` edges when citation-fetch is on (the Phase-0
 * resolver stands down), so there's exactly one `cites` edge per (doc, work).
 */
export class CitationEvidenceProcessor {
  private readonly grobid: IGrobidClient | null;
  private readonly faithfulness: IGroundingChecker | null;
  private readonly band: [number, number];

  constructor(
    private readonly fetcher: GatedFetcher,
    private readonly cache: FetchCacheService,
    private readonly resolver: CitationResolver,
    private readonly extract: CitationExtractFn,
    private readonly embeddings: IEmbeddingProvider,
    private readonly logger: Logger,
    deps: CitationEvidenceDeps = {}
  ) {
    this.grobid = deps.grobid ?? null;
    this.faithfulness = deps.faithfulness ?? null;
    this.band = deps.uncertainBand ?? [0.34, 0.67];
  }

  async process(
    citingRel: string,
    citingFilePath: string,
    regexCitations: RawCitation[]
  ): Promise<KnowledgeGraph | null> {
    const contexts = await this.buildContexts(citingFilePath, regexCitations);
    if (contexts.length === 0) return null;

    const entities = new Map<string, Entity>();
    const relations: Relation[] = [];
    const seen = new Set<string>();
    const ensureDoc = (name: string, observations: Observation[] = []) => {
      const e = entities.get(name);
      if (e) {
        if (observations.length) e.observations.push(...observations);
        return;
      }
      entities.set(name, { name, entityType: "document", files: [], observations });
    };
    ensureDoc(citingRel); // the `from` endpoint always exists

    for (const ctx of contexts) {
      const name = citationNodeName({ raw: ctx.raw, ...ctx.ids });
      if (name === citingRel || seen.has(name)) continue;
      seen.add(name);

      const contribution = await this.resolveOne(citingRel, name, ctx);
      for (const e of contribution.entities) ensureDoc(e.name, e.observations);
      relations.push(...contribution.relations);
    }

    return relations.length || entities.size > 1
      ? { entities: Array.from(entities.values()), relations }
      : null;
  }

  /** Resolve → fetch → fold → span-select → label for one cited work (cached). */
  private async resolveOne(
    citingRel: string,
    nodeName: string,
    ctx: CitationContext
  ): Promise<KnowledgeGraph> {
    const createdAt = new Date().toISOString();
    const statedObs = citationObservations({ raw: ctx.raw, ...ctx.ids }, citingRel, createdAt);

    const target = await this.resolver.resolve(ctx.ids);
    if (!target) {
      // Unresolvable (no id / closed / no title-resolver): bare cites edge.
      return this.unresolved(citingRel, nodeName, statedObs);
    }

    // WS-04: a cached fetch reuses the cited work's CONTENT (URL-scoped), but
    // span-select + judge run PER citing doc on every call — the verdict is
    // claim-specific, so a work cited by two docs gets two faithfulness labels.
    const cached = this.cache.get(target.url);
    if (cached?.citationContent) {
      const { chunks, graphs, resolved } = cached.citationContent;
      return this.judgeAndBuild(citingRel, nodeName, ctx, target.url, statedObs, chunks, graphs, resolved, createdAt);
    }

    const r = await this.fetcher.fetch(target.url, "");
    if (r.resolved && r.tempPath) {
      let chunks: string[] = [];
      let graphs: KnowledgeGraph[] = [];
      try {
        ({ chunks, graphs } = await this.extract(r.tempPath, target.url));
      } catch (err) {
        this.logger.warn(`Cited-work extraction failed for ${target.url}: ${err}`);
      } finally {
        fs.promises.unlink(r.tempPath).catch(() => undefined);
      }
      // Cache the fetched CONTENT (not the verdict) so a later doc re-judges its
      // own claim without a refetch.
      await this.cache.append({
        url: target.url,
        resolved: true,
        status: r.status,
        contentType: r.contentType,
        fetchedAt: createdAt,
        citationContent: { chunks, graphs, resolved: true },
      });
      return this.judgeAndBuild(citingRel, nodeName, ctx, target.url, statedObs, chunks, graphs, true, createdAt);
    }

    // Not resolved. WS-03: cache a DETERMINISTIC negative permanently (don't
    // refetch a not-allowlisted/robots/too-large URL), but mark a TRANSIENT
    // failure so the cache expires it and a later run retries.
    this.logger.info(`Citation not resolved (${r.reason}): ${target.url}`);
    const transient = isTransientFetchReason(r.reason);
    await this.cache.append({
      url: target.url,
      resolved: false,
      reason: r.reason,
      status: r.status,
      contentType: r.contentType,
      fetchedAt: createdAt,
      citationContent: { chunks: [], graphs: [], resolved: false },
      ...(transient ? { transient: true } : {}),
    });
    return this.contribution(citingRel, nodeName, target.url, statedObs, [], null, null, undefined, createdAt, false);
  }

  /** Span-select + judge for THIS doc's claim, then assemble the contribution.
   * Shared by the fresh-fetch and cache-hit paths (WS-04). */
  private async judgeAndBuild(
    citingRel: string,
    nodeName: string,
    ctx: CitationContext,
    url: string,
    statedObs: Observation[],
    chunks: string[],
    graphs: KnowledgeGraph[],
    resolved: boolean,
    createdAt: string
  ): Promise<KnowledgeGraph> {
    if (!resolved) {
      return this.contribution(citingRel, nodeName, url, statedObs, [], null, null, undefined, createdAt, false);
    }
    const span = await this.selectSpan(ctx.citingClaim, chunks);
    const verdict = await this.judge(ctx, span);
    const faithNote =
      !verdict && ctx.citingClaim && ctx.soleReferent === false
        ? "co-cited with other works — faithfulness not assessed"
        : undefined;
    return this.contribution(citingRel, nodeName, url, statedObs, graphs, span, verdict, faithNote, createdAt);
  }

  /** Assemble the cited-work node (stated metadata + fetched content) + the
   * `cites` edge, stamped with the faithfulness verdict when present. */
  private contribution(
    citingRel: string,
    nodeName: string,
    url: string,
    statedObs: Observation[],
    contentGraphs: KnowledgeGraph[],
    span: { span: string; score: number } | null,
    verdict: { label: "supported" | "unsupported" | "uncertain"; score: number } | null,
    faithNote: string | undefined,
    createdAt: string,
    resolved = true
  ): KnowledgeGraph {
    const entities: Entity[] = [];
    const obs: Observation[] = [...statedObs];
    if (resolved) obs.push({ text: `Fetched OA full text from ${url}`, source: url, createdAt });
    if (verdict) {
      obs.push({ text: `${FAITH}: ${verdict.label} (${verdict.score.toFixed(2)})`, source: url, createdAt });
    } else if (faithNote) {
      obs.push({ text: `${FAITH}: ${faithNote}`, source: url, createdAt });
    }
    entities.push({ name: nodeName, entityType: "document", files: [], observations: obs });

    // Fold the cited work's own extracted KG, re-stamping provenance to the URL.
    for (const g of contentGraphs) {
      for (const e of g.entities) {
        entities.push({ ...e, observations: e.observations.map((o) => ({ ...o, source: url })) });
      }
    }
    const relations = contentGraphs.flatMap((g) => g.relations);

    const edge: Relation = { from: citingRel, to: nodeName, relationType: ["cites"], source: citingRel, resolved };
    if (verdict && span) {
      edge.faithfulness = verdict.label;
      edge.faithfulnessScore = verdict.score;
      edge.supportingSpan = span.span.slice(0, 1000);
    }
    relations.push(edge);
    return { entities, relations };
  }

  private unresolved(citingRel: string, nodeName: string, statedObs: Observation[]): KnowledgeGraph {
    return {
      entities: [{ name: nodeName, entityType: "document", files: [], observations: statedObs }],
      relations: [{ from: citingRel, to: nodeName, relationType: ["cites"], source: citingRel, resolved: false }],
    };
  }

  /** Merge GROBID's marker-linked contexts (claims) with the regex id-bearing set. */
  private async buildContexts(filePath: string, regex: RawCitation[]): Promise<CitationContext[]> {
    if (this.grobid) {
      try {
        const g = await this.grobid.process(filePath);
        if (g.length) return g;
        this.logger.info("GROBID returned no citation contexts; falling back to regex citations");
      } catch (err) {
        this.logger.warn(`GROBID unavailable (${err}); falling back to regex citations`);
      }
    }
    return regex.map((c) => ({
      ids: { arxivId: c.arxivId, doi: c.doi, pmid: c.pmid, title: c.title },
      raw: c.raw,
    }));
  }

  /** Select the span the citing claim relies on: exact substring → embedding
   * cosine → fuzzy fallback. Returns the best chunk (+ score), not the whole doc. */
  private async selectSpan(
    claim: string | undefined,
    allChunks: string[]
  ): Promise<{ span: string; score: number } | null> {
    if (!claim || allChunks.length === 0) return null;
    // Body-only candidates (drop the cited work's bibliography), sub-split into
    // focused passages — a citing claim is grounded in a paragraph, not a page.
    const chunks = dropReferenceChunks(allChunks).flatMap((c) => splitPassages(c));
    if (chunks.length === 0) return null;
    const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
    const nc = norm(claim);
    if (nc.length >= 40) {
      const needle = nc.slice(0, 80);
      const hit = chunks.find((ch) => norm(ch).includes(needle));
      if (hit) return { span: hit, score: 1 };
    }
    try {
      const [cv, ...cvs] = await this.embeddings.embedBatch([claim, ...chunks]);
      let best = -1;
      let bi = 0;
      cvs.forEach((v, i) => {
        const s = cosineSimilarity(cv, v);
        if (s > best) {
          best = s;
          bi = i;
        }
      });
      return { span: chunks[bi], score: best };
    } catch (err) {
      this.logger.warn(`Span embedding failed (${err}); using fuzzy overlap`);
      let best = -1;
      let bi = 0;
      chunks.forEach((ch, i) => {
        const s = jaroWinklerSimilarity(nc.slice(0, 200), norm(ch).slice(0, 200));
        if (s > best) {
          best = s;
          bi = i;
        }
      });
      return best > 0 ? { span: chunks[bi], score: best } : null;
    }
  }

  /** Run MiniCheck on (claim, span) and map the score to a 3-way label — but only
   * for a SINGLE-referent citing sentence. A multi-cite sentence makes a collective
   * claim not attributable to this one work, so we abstain (no label) rather than
   * emit a meaningless verdict (the live-probe lesson: every multi-cite claim
   * mis-scored `unsupported`). */
  private async judge(
    ctx: CitationContext,
    span: { span: string; score: number } | null
  ): Promise<{ label: "supported" | "unsupported" | "uncertain"; score: number } | null> {
    if (!this.faithfulness || !ctx.citingClaim || !span) return null;
    if (ctx.soleReferent === false) return null; // co-cited — not attributable
    try {
      const v = await this.faithfulness.check(ctx.citingClaim, span.span);
      // WS-18: if the NLI model didn't actually run (the checker degraded to a
      // keyword-overlap fallback during an outage), ABSTAIN rather than emit a
      // low-confidence keyword verdict — which would otherwise bias the cited
      // work's faithfulness toward `unsupported`. No label, no caching.
      if (v.checker === "keyword") {
        this.logger.info("Faithfulness checker degraded to keyword fallback; abstaining (no label)");
        return null;
      }
      return { label: this.label(v.score), score: v.score };
    } catch (err) {
      this.logger.warn(`Faithfulness check failed: ${err}`);
      return null;
    }
  }

  private label(score: number): "supported" | "unsupported" | "uncertain" {
    const [lo, hi] = this.band;
    if (score >= hi) return "supported";
    if (score <= lo) return "unsupported";
    return "uncertain";
  }
}

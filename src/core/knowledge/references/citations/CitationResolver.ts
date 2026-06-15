import { Logger } from "../../../../shared";

/**
 * Phase 2a — resolve a cited work's identifier to an OPEN-ACCESS full-text URL
 * the gated fetcher can pull. Pure-ish network helper (id → URL), cached by the
 * caller via the fetch cache; every path is try/caught → `null` (never throws,
 * never fabricates a URL). The fetch itself + all guards stay in `GatedFetcher`.
 *
 *   arXiv id → https://arxiv.org/pdf/<id>           (always OA)
 *   DOI      → Unpaywall best_oa_location.url_for_pdf   (needs a polite email)
 *   PMID     → PMC id-converter → /pmc/articles/<PMCID>/pdf/
 *   title    → TitleIdResolver (Phase 2d) → recurse on the resolved id
 */

export interface ResolvableCitation {
  arxivId?: string;
  doi?: string;
  pmid?: string;
  title?: string;
}

export interface ResolvedTarget {
  url: string;
  host: string;
}

/** Title → hard-id resolver seam (Phase 2d). Null when titleResolver disabled. */
export interface ITitleIdResolver {
  resolve(title: string): Promise<{ doi?: string; arxivId?: string } | null>;
}

export interface CitationResolverOptions {
  /** Unpaywall polite-pool email; without it DOI citations can't be resolved. */
  unpaywallEmail?: string;
}

type FetchFn = (url: string, init?: any) => Promise<Response>;

export class CitationResolver {
  constructor(
    private readonly opts: CitationResolverOptions,
    private readonly logger: Logger,
    private readonly titleResolver: ITitleIdResolver | null = null,
    private readonly fetchFn: FetchFn = (globalThis as any).fetch
  ) {}

  async resolve(c: ResolvableCitation, _depth = 0): Promise<ResolvedTarget | null> {
    if (c.arxivId) return this.target(`https://arxiv.org/pdf/${c.arxivId}`);
    if (c.doi) {
      const url = await this.unpaywall(c.doi);
      return url ? this.target(url) : null;
    }
    if (c.pmid) {
      const url = await this.pmc(c.pmid);
      return url ? this.target(url) : null;
    }
    // id-less: try the title resolver once (Phase 2d), then resolve the hard id.
    if (c.title && this.titleResolver && _depth === 0) {
      try {
        const ids = await this.titleResolver.resolve(c.title);
        if (ids && (ids.doi || ids.arxivId)) return this.resolve({ ...ids }, _depth + 1);
      } catch (err) {
        this.logger.warn(`Title resolution failed for "${c.title.slice(0, 60)}": ${err}`);
      }
    }
    return null;
  }

  private target(url: string): ResolvedTarget | null {
    try {
      return { url, host: new URL(url).hostname };
    } catch {
      return null;
    }
  }

  /** DOI → Unpaywall best OA PDF (or landing) URL; null when closed or no email. */
  private async unpaywall(doi: string): Promise<string | null> {
    if (!this.opts.unpaywallEmail) {
      this.logger.warn("Unpaywall email unset (references.citations.fetch.unpaywallEmail) — skipping DOI resolution");
      return null;
    }
    try {
      const r = await this.fetchFn(
        `https://api.unpaywall.org/v2/${encodeURIComponent(doi)}?email=${encodeURIComponent(this.opts.unpaywallEmail)}`
      );
      if (!r.ok) return null;
      const j = (await r.json()) as {
        best_oa_location?: { url_for_pdf?: string | null; url?: string | null };
      };
      const loc = j.best_oa_location;
      return loc?.url_for_pdf || loc?.url || null;
    } catch (err) {
      this.logger.warn(`Unpaywall lookup failed for ${doi}: ${err}`);
      return null;
    }
  }

  /** PMID → PMCID (id-converter) → PMC article PDF URL; null when not in PMC. */
  private async pmc(pmid: string): Promise<string | null> {
    try {
      const r = await this.fetchFn(
        `https://www.ncbi.nlm.nih.gov/pmc/utils/idconv/v1.0/?ids=${encodeURIComponent(pmid)}&format=json`
      );
      if (!r.ok) return null;
      const j = (await r.json()) as { records?: Array<{ pmcid?: string }> };
      const pmcid = j.records?.[0]?.pmcid;
      return pmcid ? `https://www.ncbi.nlm.nih.gov/pmc/articles/${pmcid}/pdf/` : null;
    } catch (err) {
      this.logger.warn(`PMC id-convert failed for PMID ${pmid}: ${err}`);
      return null;
    }
  }
}

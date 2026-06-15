import { Logger } from "../../../../shared";
import { jaroWinklerSimilarity } from "../../../../shared/utils";
import { ITitleIdResolver } from "./CitationResolver";

/**
 * Phase 2d — resolve an id-LESS reference (the majority in real bibliographies)
 * to a hard id via a title→id cascade: Crossref (the DOI authority, ≈96% F1 on
 * unstructured strings) → Semantic Scholar (strong CS/ML) → OpenAlex (broadest).
 * Each candidate is gated by a title-similarity threshold (jaroWinkler) so a
 * loose keyword match isn't accepted as the cited work. Always sends `mailto`
 * (polite pool); supports API keys for OpenAlex (required Feb 2026) and S2.
 *
 * Every stage is try/caught → fall through; a miss returns null (the citation
 * stays a bare `resolved:false` edge). Gated by `references.citations.titleResolver`.
 */
export interface TitleIdResolverOptions {
  mailto?: string;
  openAlexKey?: string;
  semanticScholarKey?: string;
  minTitleSimilarity: number;
}

type FetchFn = (url: string, init?: any) => Promise<Response>;

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

export class TitleIdResolver implements ITitleIdResolver {
  constructor(
    private readonly opts: TitleIdResolverOptions,
    private readonly logger: Logger,
    private readonly fetchFn: FetchFn = (globalThis as any).fetch
  ) {}

  async resolve(title: string): Promise<{ doi?: string; arxivId?: string } | null> {
    const q = title.trim();
    if (q.length < 8) return null; // too short to match reliably
    return (
      (await this.crossref(q)) ?? (await this.semanticScholar(q)) ?? (await this.openAlex(q))
    );
  }

  private similar(a: string, b: string | undefined): boolean {
    return !!b && jaroWinklerSimilarity(norm(a), norm(b)) >= this.opts.minTitleSimilarity;
  }

  private mailtoParam(): string {
    return this.opts.mailto ? `&mailto=${encodeURIComponent(this.opts.mailto)}` : "";
  }

  private async crossref(title: string): Promise<{ doi?: string } | null> {
    try {
      const r = await this.fetchFn(
        `https://api.crossref.org/works?rows=3&query.bibliographic=${encodeURIComponent(title)}${this.mailtoParam()}`
      );
      if (!r.ok) return null;
      const j = (await r.json()) as { message?: { items?: Array<{ DOI?: string; title?: string[] }> } };
      for (const it of j.message?.items ?? []) {
        if (it.DOI && this.similar(title, it.title?.[0])) return { doi: it.DOI };
      }
    } catch (err) {
      this.logger.warn(`Crossref title lookup failed: ${err}`);
    }
    return null;
  }

  private async semanticScholar(title: string): Promise<{ doi?: string; arxivId?: string } | null> {
    try {
      const r = await this.fetchFn(
        `https://api.semanticscholar.org/graph/v1/paper/search?limit=3&fields=title,externalIds&query=${encodeURIComponent(title)}`,
        this.opts.semanticScholarKey ? { headers: { "x-api-key": this.opts.semanticScholarKey } } : undefined
      );
      if (!r.ok) return null;
      const j = (await r.json()) as {
        data?: Array<{ title?: string; externalIds?: { DOI?: string; ArXiv?: string } }>;
      };
      for (const it of j.data ?? []) {
        if (!this.similar(title, it.title)) continue;
        if (it.externalIds?.ArXiv) return { arxivId: it.externalIds.ArXiv };
        if (it.externalIds?.DOI) return { doi: it.externalIds.DOI };
      }
    } catch (err) {
      this.logger.warn(`Semantic Scholar title lookup failed: ${err}`);
    }
    return null;
  }

  private async openAlex(title: string): Promise<{ doi?: string } | null> {
    try {
      const key = this.opts.openAlexKey ? `&api_key=${encodeURIComponent(this.opts.openAlexKey)}` : this.mailtoParam();
      const r = await this.fetchFn(
        `https://api.openalex.org/works?per_page=3&filter=title.search:${encodeURIComponent(title)}${key}`
      );
      if (!r.ok) return null;
      const j = (await r.json()) as { results?: Array<{ doi?: string; title?: string }> };
      for (const it of j.results ?? []) {
        if (it.doi && this.similar(title, it.title)) {
          return { doi: it.doi.replace(/^https?:\/\/(dx\.)?doi\.org\//i, "") };
        }
      }
    } catch (err) {
      this.logger.warn(`OpenAlex title lookup failed: ${err}`);
    }
    return null;
  }
}

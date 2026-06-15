import * as fs from "fs";
import * as path from "path";
import * as cheerio from "cheerio";
import { Logger } from "../../../../shared";
import { CitationContext, IGrobidClient } from "./CitationEvidenceProcessor";

/**
 * Phase 2b — GROBID client. The crux Dove's research settled: regex over
 * pdf2json text cannot recover the in-text-marker→bibliography-entry mapping
 * (rule recall ≈0.22). GROBID, a local CRF service (run via Docker:
 * `docker run -p 8070:8070 lfoppiano/grobid`), parses the citing PDF into TEI
 * that links each callout to its reference with resolved ids.
 *
 * We POST the PDF to `/api/processFulltextDocument` and parse the TEI (cheerio,
 * xmlMode): each `<biblStruct xml:id="bN">` is a reference (its `<idno>` carries
 * DOI/arXiv, `<title level="a">` the title); each in-text `<ref type="bibr"
 * target="#bN">` sits inside the citing sentence/paragraph — that text is the
 * claim we later check for faithfulness. Fully offline once GROBID is running;
 * unreachable ⇒ the processor falls back to regex id-bearing citations.
 *
 * NOTE: confirm the exact endpoint params (`consolidateCitations`,
 * `includeRawCitations`, `segmentSentences`) against the running GROBID version.
 */
type FetchFn = (url: string, init?: any) => Promise<Response>;

const ARXIV_RE = /(\d{4}\.\d{4,5}(?:v\d+)?)/;
const DOI_RE = /10\.\d{4,9}\/[-._;()/:a-z0-9]+/i;

export class GrobidClient implements IGrobidClient {
  constructor(
    private readonly url: string,
    private readonly logger: Logger,
    private readonly fetchFn: FetchFn = (globalThis as any).fetch
  ) {}

  /** Liveness probe so wiring can warn early; the processor degrades regardless. */
  async isAlive(): Promise<boolean> {
    try {
      const r = await this.fetchFn(`${this.url}/api/isalive`);
      return r.ok;
    } catch {
      return false;
    }
  }

  async process(filePath: string): Promise<CitationContext[]> {
    const buf = await fs.promises.readFile(filePath);
    const form = new FormData();
    form.append("input", new Blob([buf]), path.basename(filePath) || "doc.pdf");
    form.append("consolidateCitations", "1");
    form.append("includeRawCitations", "1");

    const res = await this.fetchFn(`${this.url}/api/processFulltextDocument`, {
      method: "POST",
      body: form,
    });
    if (!res.ok) throw new Error(`GROBID ${res.status}`);
    return this.parseTei(await res.text());
  }

  /** TEI → contexts: join each reference's ids/title with the sentence that cites it. */
  parseTei(xml: string): CitationContext[] {
    const $ = cheerio.load(xml, { xmlMode: true });

    // 1) bibliography: xml:id → {ids, title, raw}
    const refs = new Map<string, CitationContext>();
    $("listBibl biblStruct").each((_, el) => {
      const $el = $(el);
      const id = $el.attr("xml:id");
      if (!id) return;

      let doi: string | undefined;
      let arxivId: string | undefined;
      $el.find("idno").each((__, idno) => {
        const type = ($(idno).attr("type") || "").toLowerCase();
        const txt = $(idno).text().trim();
        if (type === "doi" || DOI_RE.test(txt)) doi = doi || (DOI_RE.exec(txt)?.[0] ?? txt);
        if (type === "arxiv") arxivId = arxivId || (ARXIV_RE.exec(txt)?.[1] ?? txt);
      });
      const title =
        $el.find('title[level="a"]').first().text().trim() ||
        $el.find('title[level="m"]').first().text().trim() ||
        $el.find("title").first().text().trim() ||
        undefined;
      const raw = $el.find("note[type='raw_reference']").first().text().trim() || title || id;

      refs.set(id, { ids: { arxivId, doi, title }, raw });
    });

    // 2) in-text callouts: target #bN → the enclosing sentence/paragraph text.
    $('ref[type="bibr"]').each((_, el) => {
      const target = ($(el).attr("target") || "").replace(/^#/, "");
      const ctx = refs.get(target);
      if (!ctx || ctx.citingClaim) return; // first claim wins; keep it cheap
      const $el = $(el);
      const host = $el.closest("s").length ? $el.closest("s") : $el.closest("p");
      const claim = host.text().replace(/\s+/g, " ").trim();
      if (claim) ctx.citingClaim = claim;
    });

    const out = Array.from(refs.values()).filter(
      (c) => c.ids.arxivId || c.ids.doi || c.ids.title
    );
    this.logger.info(
      `GROBID parsed ${out.length} reference(s), ${out.filter((c) => c.citingClaim).length} with a citing claim`
    );
    return out;
  }
}

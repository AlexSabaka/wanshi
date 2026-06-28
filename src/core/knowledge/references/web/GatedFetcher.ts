import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import { z } from "zod";
import { ILLMProvider } from "../../../../types/ILLMProvider";
import { Logger } from "../../../../shared";

/**
 * The shared Phase-1 network primitive: fetch one external URL behind layered,
 * always-on guards. Returns a staged temp file only when EVERY guard passes;
 * any failure yields `{ resolved:false, reason }` (never fabricated content).
 *
 * Guard order (cheapest/safest first): allowlist (empty ⇒ no fetch, the master
 * switch) → rejectlist → robots.txt → per-run budget → timed fetch → content-type
 * → size cap → LLM relevance pre-check. Offline-first: this only runs when the
 * caller opted into `references.web`; a default run never constructs it.
 */
const USER_AGENT = "wanshi-reference-fetcher/1 (+https://github.com/AlexSabaka/wanshi)";

/** A redirect hop pointed at a blocked/off-allowlist target (WS-15 SSRF guard). */
class RedirectBlockedError extends Error {
  constructor(public readonly target: string, public readonly kind = "redirect-blocked") {
    super(`${kind}: ${target}`);
    this.name = "RedirectBlockedError";
  }
}

export interface GatedFetcherOptions {
  allowlist: string[];
  rejectlist: string[];
  maxFetches: number;
  timeoutMs: number;
  maxBytes: number;
  relevanceCheck: boolean;
  robots: boolean;
  /** Phase 2: also accept `application/pdf` bodies (staged as a binary `.pdf`,
   * routed through PdfReader downstream). Web fetch (Phase 1) leaves this false →
   * html-only. PDFs skip the html title/relevance gate (the allowlist is the gate). */
  allowPdf?: boolean;
  /** When true, a transport error fetching robots.txt or an LLM error in the
   * relevance gate BLOCKS the fetch (fail-closed) instead of letting it through
   * (fail-open). Default (undefined/false) preserves the original fail-open
   * behavior — byte-identical for callers that don't opt in. */
  failClosed?: boolean;
}

export interface FetchResult {
  resolved: boolean;
  reason?: string;
  status?: number;
  contentType?: string;
  tempPath?: string;
  title?: string;
}

type FetchFn = (url: string, init?: any) => Promise<Response>;

export class GatedFetcher {
  private fetched = 0; // per-run budget counter
  private readonly robotsCache = new Map<string, string[]>(); // host → Disallow paths

  constructor(
    private readonly opts: GatedFetcherOptions,
    private readonly llm: ILLMProvider,
    private readonly logger: Logger,
    private readonly tempDir: string = "./temp",
    private readonly fetchFn: FetchFn = (globalThis as any).fetch
  ) {}

  /** True if the URL's host/prefix is allowlisted (and not rejectlisted). */
  private allowed(url: string): boolean {
    if (this.opts.rejectlist.some((p) => this.matches(url, p))) return false;
    return this.opts.allowlist.some((p) => this.matches(url, p));
  }

  private matches(url: string, pattern: string): boolean {
    // URL-prefix form ("https://arxiv.org/abs"): require a real origin match +
    // pathname-prefix, NOT a raw string prefix — otherwise `https://arxiv.org.evil.com`
    // sneaks past `https://arxiv.org` (WS-02). Bare-domain form falls through below.
    if (/^https?:\/\//i.test(pattern)) {
      try {
        const urlObj = new URL(url);
        const patternObj = new URL(pattern);
        return (
          urlObj.origin === patternObj.origin &&
          urlObj.pathname.startsWith(patternObj.pathname)
        );
      } catch {
        return false;
      }
    }
    try {
      const host = new URL(url).hostname;
      return host === pattern || host.endsWith(`.${pattern}`); // domain / subdomain
    } catch {
      return false;
    }
  }

  /**
   * Minimal robots.txt check for `User-agent: *` Disallow rules.
   *
   * Fail mode on an unreachable robots.txt is configurable: fail-open (default,
   * unreachable ⇒ not blocked — the allowlist is the real gate) or fail-closed
   * (`failClosed`, unreachable ⇒ blocked). On a 200/404 the parsed (possibly
   * empty) rule set is cached; a transport error is NOT cached so the next run
   * re-checks instead of permanently treating the host as rule-free (WS-34).
   */
  private async robotsBlocked(url: string): Promise<boolean> {
    if (!this.opts.robots) return false;
    let u: URL;
    try {
      u = new URL(url);
    } catch {
      return false;
    }
    if (!this.robotsCache.has(u.host)) {
      let disallow: string[] = [];
      try {
        const res = await this.timedFetch(`${u.protocol}//${u.host}/robots.txt`);
        // Only cache rules on a definitive 200/404 (404 ⇒ legitimately no rules).
        if (res.ok || res.status === 404) {
          if (res.ok) {
            let inStar = false;
            for (const raw of (await res.text()).split("\n")) {
              const line = raw.replace(/#.*$/, "").trim();
              const ua = /^user-agent:\s*(.+)$/i.exec(line);
              if (ua) inStar = ua[1].trim() === "*";
              else if (inStar) {
                const d = /^disallow:\s*(.*)$/i.exec(line);
                if (d && d[1].trim()) disallow.push(d[1].trim());
              }
            }
          }
          this.robotsCache.set(u.host, disallow);
        } else if (this.opts.failClosed) {
          // Non-200/404 (5xx, etc.) with fail-closed ⇒ block, don't cache.
          return true;
        }
        // Non-200/404 fail-open ⇒ treat as no rules, but don't cache (re-check later).
      } catch {
        // Transport error (timeout/DNS): block when fail-closed; otherwise let it
        // through (allowlist is the real gate). Either way DON'T cache the failure.
        if (this.opts.failClosed) return true;
      }
    }
    const rules = this.robotsCache.get(u.host);
    if (!rules) return false; // uncached (transport error, fail-open) ⇒ not blocked
    return rules.some((p) => u.pathname.startsWith(p));
  }

  /**
   * Reject hosts that should never be fetched after a redirect (SSRF guard, WS-15):
   * non-http(s) schemes, loopback, RFC1918 private ranges, link-local, and the
   * cloud metadata address. A bare hostname (DNS name) is allowed here — the
   * allowlist still gates it; this only blocks the obvious internal literals.
   */
  private isBlockedHost(target: string): boolean {
    let u: URL;
    try {
      u = new URL(target);
    } catch {
      return true; // unparseable ⇒ block
    }
    if (u.protocol !== "http:" && u.protocol !== "https:") return true;
    const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, ""); // strip IPv6 brackets
    if (host === "localhost" || host.endsWith(".localhost")) return true;
    // IPv6 loopback / link-local / unique-local.
    if (host === "::1" || host.startsWith("fe80:") || host.startsWith("fc") || host.startsWith("fd")) {
      return true;
    }
    const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
    if (m) {
      const [a, b] = [Number(m[1]), Number(m[2])];
      if (a === 127) return true; // loopback
      if (a === 10) return true; // RFC1918
      if (a === 172 && b >= 16 && b <= 31) return true; // RFC1918
      if (a === 192 && b === 168) return true; // RFC1918
      if (a === 169 && b === 254) return true; // link-local / metadata (169.254.169.254)
      if (a === 0) return true; // 0.0.0.0/8
    }
    return false;
  }

  /** A single timed hop with NO automatic redirect following (WS-15). */
  private timedFetch(url: string): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.opts.timeoutMs);
    return this.fetchFn(url, {
      signal: controller.signal,
      redirect: "manual",
      headers: { "User-Agent": USER_AGENT },
    }).finally(() => clearTimeout(timer));
  }

  /**
   * Fetch following redirects MANUALLY (WS-15 SSRF guard): each 3xx Location is
   * re-validated through `allowed()` + `isBlockedHost()` before the next hop, so
   * a permitted origin can't bounce us onto loopback/RFC1918/metadata. Bounded to
   * `maxHops`; a non-3xx response (or an exhausted chain) is returned as-is.
   */
  private async timedFetchFollow(url: string, maxHops = 5): Promise<Response> {
    let current = url;
    for (let hop = 0; hop <= maxHops; hop++) {
      const res = await this.timedFetch(current);
      if (res.status < 300 || res.status >= 400) return res;
      const location = res.headers.get("location");
      if (!location) return res; // 3xx with no Location — let the caller see it
      const next = new URL(location, current).toString();
      if (this.isBlockedHost(next) || !this.allowed(next)) {
        throw new RedirectBlockedError(next);
      }
      current = next;
    }
    throw new RedirectBlockedError(current, "too-many-redirects");
  }

  async fetch(url: string, scope: string): Promise<FetchResult> {
    if (!this.allowed(url)) return { resolved: false, reason: "not-allowlisted" };
    if (await this.robotsBlocked(url)) return { resolved: false, reason: "robots-disallow" };
    if (this.fetched >= this.opts.maxFetches) return { resolved: false, reason: "budget-exceeded" };

    this.fetched++;
    let res: Response;
    try {
      res = await this.timedFetchFollow(url);
    } catch (err: any) {
      if (err instanceof RedirectBlockedError) {
        this.logger.warn(`Blocked redirect for ${url} → ${err.target} (${err.kind})`);
        return { resolved: false, reason: err.kind, status: 0 };
      }
      const reason = err?.name === "AbortError" ? "timeout" : "fetch-error";
      this.logger.warn(`Fetch ${reason} for ${url}: ${err?.message ?? err}`);
      return { resolved: false, reason, status: 0 };
    }
    if (!res.ok) return { resolved: false, reason: `http-${res.status}`, status: res.status };

    const contentType = res.headers.get("content-type") ?? "";
    const isHtml = /text\/html|application\/xhtml/i.test(contentType);
    const isPdf = !!this.opts.allowPdf && /application\/pdf/i.test(contentType);
    if (!isHtml && !isPdf) {
      return { resolved: false, reason: `content-type:${contentType.split(";")[0] || "unknown"}`, status: res.status, contentType };
    }

    // PDF path (Phase 2 citation full text): stage the bytes verbatim as `.pdf`,
    // skipping the html title/relevance gate (the allowlist of OA hosts is the gate).
    if (isPdf) {
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.byteLength > this.opts.maxBytes) {
        return { resolved: false, reason: "too-large", status: res.status, contentType };
      }
      const tempPath = await this.stage(url, buf, "pdf");
      return { resolved: true, status: res.status, contentType, tempPath };
    }

    const body = await res.text();
    if (Buffer.byteLength(body) > this.opts.maxBytes) {
      return { resolved: false, reason: "too-large", status: res.status, contentType };
    }

    const title = this.extractTitle(body);
    if (this.opts.relevanceCheck && !(await this.relevant(url, title, body, scope))) {
      return { resolved: false, reason: "irrelevant", status: res.status, contentType, title };
    }

    const tempPath = await this.stage(url, body, "html");
    return { resolved: true, status: res.status, contentType, tempPath, title };
  }

  private extractTitle(html: string): string {
    const t = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
    const d = /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i.exec(html);
    return [t?.[1]?.trim(), d?.[1]?.trim()].filter(Boolean).join(" — ").slice(0, 400);
  }

  /** Cheap LLM gate before the expensive extraction (fail-open on error). */
  private async relevant(url: string, title: string, html: string, scope: string): Promise<boolean> {
    try {
      const res = await this.llm.generateStructured(
        [
          {
            role: "system",
            content:
              "You decide if a web page is relevant to a knowledge-graph's scope. " +
              "Answer only by setting `relevant` true or false.",
          },
          {
            role: "user",
            content: `Scope: ${scope || "(general)"}\nURL: ${url}\nTitle/desc: ${title || "(none)"}\nRelevant?`,
          },
        ],
        z.object({ relevant: z.boolean() })
      );
      return res.relevant === true;
    } catch (err) {
      // fail-closed ⇒ an unavailable LLM blocks the fetch; default fail-open keeps it.
      const passes = !this.opts.failClosed;
      this.logger.warn(
        `Relevance check failed for ${url} (treating as ${passes ? "relevant" : "irrelevant"}): ${err}`
      );
      return passes;
    }
  }

  private async stage(url: string, body: string | Buffer, ext: "html" | "pdf"): Promise<string> {
    await fs.promises.mkdir(this.tempDir, { recursive: true });
    const name = crypto.createHash("sha1").update(url).digest("hex").slice(0, 16);
    const p = path.join(this.tempDir, `${name}.${ext}`);
    if (typeof body === "string") await fs.promises.writeFile(p, body, "utf-8");
    else await fs.promises.writeFile(p, body);
    return p;
  }
}

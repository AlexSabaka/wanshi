import { Ollama } from "ollama";
import { Logger } from "../../../shared";
import { IGroundingChecker, GroundingVerdict } from "../../../types";
import { FactualEvaluator } from "../../../quality/FactualMetrics";
import { splitSentences } from "./verbalize";

export interface MiniCheckOptions {
  /** Ollama model id — default `bespoke-minicheck:7b` (set in the schema). */
  model: string;
  /** Ollama host; defaults to the local daemon. */
  host?: string;
  /** Keyword fallback threshold used when the NLI call errors. */
  min: number;
  /** Keyword score at/above which we accept without an NLI call (pre-filter). */
  escalateAbove: number;
}

/** The slice of the Ollama client this checker needs (injectable for tests). */
export interface MiniCheckClient {
  generate(req: {
    model: string;
    prompt: string;
    stream: false;
    options?: Record<string, unknown>;
  }): Promise<{ response: string }>;
}

/**
 * Grounding via MiniCheck (bespoke-minicheck:7b) — a purpose-built
 * `(document, claim) → Yes/No` fact-checker (arXiv:2404.10774). Unlike keyword
 * overlap it rewards paraphrase and doesn't require the verbatim entity name,
 * so snake_case canonical names stop auto-failing (KG-08).
 *
 * Cost control: keyword overlap stays as a cheap pre-filter — a claim with high
 * verbatim overlap (`>= escalateAbove`) is accepted without an NLI call, so only
 * the *uncertain* claims reach MiniCheck. Multi-sentence claims are split to
 * sentences (MiniCheck checks atomic claims); the claim is supported iff every
 * sentence is. A checker failure degrades to the keyword verdict rather than
 * crashing the run.
 */
export class MiniCheckGroundingChecker implements IGroundingChecker {
  private readonly ollama: MiniCheckClient;

  constructor(
    private readonly opts: MiniCheckOptions,
    private readonly logger: Logger,
    client?: MiniCheckClient
  ) {
    this.ollama = client ?? new Ollama({ host: opts.host });
  }

  async check(claim: string, source: string): Promise<GroundingVerdict> {
    const ks = FactualEvaluator.observationGroundingScore(claim, source);
    // Pre-filter: obvious verbatim grounding skips the NLI call.
    if (ks >= this.opts.escalateAbove) {
      return { score: ks, supported: true, checker: "keyword" };
    }

    const sentences = splitSentences(claim);
    if (sentences.length === 0) {
      return { score: 1, supported: true, checker: "minicheck" };
    }

    try {
      let supported = 0;
      for (const sentence of sentences) {
        if (await this.miniCheck(source, sentence)) supported++;
      }
      const score = supported / sentences.length;
      return { score, supported: supported === sentences.length, checker: "minicheck" };
    } catch (error) {
      // Grounding is an enhancement — never let a checker failure crash the run.
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `MiniCheck unavailable (${message}); falling back to keyword overlap for this claim`
      );
      return { score: ks, supported: ks >= this.opts.min, checker: "keyword" };
    }
  }

  /** One `(document, claim) → boolean` MiniCheck call. */
  private async miniCheck(document: string, claim: string): Promise<boolean> {
    const res = await this.ollama.generate({
      model: this.opts.model,
      prompt: `Document: ${document}\nClaim: ${claim}`,
      stream: false,
      options: { temperature: 0, num_predict: 4 },
    });
    return this.parseVerdict(res.response);
  }

  /** Lenient parse: the model emits `Yes`/`No`; tolerate `1`/`true` variants. */
  private parseVerdict(raw: string): boolean {
    const t = (raw ?? "").trim().toLowerCase();
    return t.startsWith("yes") || t.startsWith("1") || t.startsWith("true");
  }
}

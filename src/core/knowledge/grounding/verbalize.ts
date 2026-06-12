/**
 * Claim verbalization + decomposition for the grounding gate.
 *
 * MiniCheck checks atomic `(document, claim)` pairs, so a multi-sentence
 * observation is split to sentences and a relation triple is rendered as one
 * natural-language claim before checking.
 */

/**
 * Split a claim into sentences for atomic fact-checking. Boundaries are
 * `.`/`!`/`?` (optionally followed by quotes/brackets) and newlines. A claim
 * with no terminator stays a single sentence; abbreviation-level precision
 * isn't needed — over-splitting only makes MiniCheck judge smaller spans.
 */
export function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?]["')\]]?)\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Render a relation triple as one claim. The predicate (`relationType`) is an
 * array of snake_case tokens; join them and turn underscores into spaces, so
 * `("EmbeddingService", ["part_of"], "kg-gen")` → "EmbeddingService part of kg-gen".
 */
export function verbalizeRelation(
  from: string,
  predicate: string[] | string,
  to: string
): string {
  const preds = Array.isArray(predicate) ? predicate : [predicate];
  const phrase = preds
    .filter(Boolean)
    .map((p) => p.replace(/_/g, " ").trim())
    .join(" and ")
    .trim();
  return `${from} ${phrase || "related to"} ${to}`.replace(/\s+/g, " ").trim();
}

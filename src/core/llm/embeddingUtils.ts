/** Floor for adaptive embedding-input shrinking — don't retry below this. */
export const MIN_EMBED_CHARS = 256;

/** Default embedding input cap (chars). Conservative for 512-token models
 * (e.g. mxbai-embed-large); raise via config for large-context cloud models. */
export const DEFAULT_MAX_EMBED_CHARS = 1024;

/**
 * Heuristic: does this error indicate the input exceeded the model's context?
 * Covers Ollama ("the input length exceeds the context length") and common
 * OpenAI-compatible phrasings.
 */
export function isContextLengthError(error: unknown): boolean {
  const msg = String((error as { message?: string })?.message ?? error).toLowerCase();
  return (
    msg.includes("context length") ||
    msg.includes("context window") ||
    msg.includes("input length") ||
    msg.includes("maximum context") ||
    msg.includes("too long") ||
    msg.includes("exceeds")
  );
}

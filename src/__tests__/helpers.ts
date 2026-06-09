import { Logger } from "../shared";
import { parseConfig, ProcessingOptions } from "../config";

/**
 * Build a fully-defaulted, validated config from a nested partial (the new
 * config shape). Use this instead of hand-rolling flat `{ model, chunkSize }`
 * fixtures — it deep-applies schema defaults so consumers reading
 * `options.llm.model` / `options.chunking.size` don't hit undefined.
 */
export function makeConfig(partial: Record<string, unknown> = {}): ProcessingOptions {
  return parseConfig(partial);
}

/** Minimal no-op Logger for unit tests (avoids tslog/file side effects). */
export function stubLogger(): Logger {
  const noop = () => undefined;
  return {
    trace: noop,
    debug: noop,
    info: noop,
    warn: noop,
    error: noop,
    fatal: noop,
  } as unknown as Logger;
}

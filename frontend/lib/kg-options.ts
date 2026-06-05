import { z } from "zod"

/**
 * The user-facing subset of kg-gen's ProcessingOptions that the run form
 * collects. Everything else falls back to the CLI's own defaults (the spawned
 * process fills them in), so this stays deliberately small.
 */
export const RunRequestSchema = z.object({
  input: z.string().min(1, "Input directory is required"),
  filter: z.array(z.string().min(1)).min(1, "At least one include pattern"),
  exclude: z.array(z.string().min(1)).default([]),
  provider: z.enum(["ollama", "openai"]).default("ollama"),
  model: z.string().min(1, "Model is required"),
  host: z.string().min(1),
  apiKey: z.string().optional(),
  output: z.string().min(1),
  exportFormat: z.enum(["json", "jsonl", "mcp-jsonl", "dot"]).default("json"),
  chunkSize: z.number().int().positive().default(2000),
  resume: z.boolean().default(false),
})

export type RunRequest = z.infer<typeof RunRequestSchema>

/**
 * Map a validated request onto the JSON config the kg-gen CLI consumes via
 * `--config`. `filter`/`exclude` MUST be arrays here (the CLI breaks on a bare
 * string), which is the main reason we drive the run through a config file
 * rather than raw CLI flags. `progressNdjson` is also set on the CLI flag; we
 * include it here too for good measure.
 */
export function buildKgConfig(req: RunRequest): Record<string, unknown> {
  return {
    input: req.input,
    filter: req.filter,
    exclude: req.exclude,
    provider: req.provider,
    model: req.model,
    host: req.host,
    ...(req.apiKey ? { apiKey: req.apiKey } : {}),
    output: req.output,
    exportFormat: req.exportFormat,
    chunkSize: req.chunkSize,
    resume: req.resume,
    progressNdjson: true,
  }
}

export const DEFAULT_RUN_REQUEST: RunRequest = {
  input: "",
  filter: ["**/*"],
  exclude: ["**/node_modules/**", "**/.git/**"],
  provider: "ollama",
  model: "llama3.2",
  host: "http://localhost:11434",
  output: "knowledge-graph.json",
  exportFormat: "json",
  chunkSize: 2000,
  resume: false,
}

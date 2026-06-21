import { readFileSync } from "node:fs"
import { TRACE_VERSION, type TraceRecord } from "@/lib/trace"

/** The trace sidecar wanshi writes next to a run's output graph. */
export function tracePathFor(output: string): string {
  return `${output}.trace.jsonl`
}

export interface LoadedTrace {
  records: TraceRecord[]
  /** Distinct envelope versions seen — non-`[TRACE_VERSION]` ⇒ a schema drift. */
  versions: number[]
}

/**
 * Parse a `<output>.trace.jsonl` sidecar into ordered records. Tolerates a
 * truncated final line (an interrupted write), mirroring the graph loader.
 */
export function loadTrace(filePath: string): LoadedTrace {
  const content = readFileSync(filePath, "utf-8")
  const records: TraceRecord[] = []
  const versions = new Set<number>()
  for (const line of content.split("\n")) {
    const trimmed = line.trim()
    if (!trimmed) continue
    try {
      const rec = JSON.parse(trimmed) as TraceRecord
      if (typeof rec.v === "number") versions.add(rec.v)
      records.push(rec)
    } catch {
      // skip a malformed/truncated final line
    }
  }
  // seq is monotonic per run but fs flush order isn't guaranteed — sort by it.
  records.sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0))
  return { records, versions: [...versions].sort((a, b) => a - b) }
}

export { TRACE_VERSION }

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import type { RunListItem } from "@/types"

/**
 * Tiny on-disk run index so the Results page survives server restarts (the
 * in-memory registry forgets runs, but the graph files persist). Not a DB —
 * one small gitignored JSON file under the app's working directory.
 */
function indexPath(): string {
  return path.join(process.cwd(), ".data", "runs.json")
}

export function listIndexedRuns(): RunListItem[] {
  const file = indexPath()
  if (!existsSync(file)) return []
  try {
    const parsed = JSON.parse(readFileSync(file, "utf-8"))
    return Array.isArray(parsed) ? (parsed as RunListItem[]) : []
  } catch {
    return [] // corrupt index — start fresh rather than crash the route
  }
}

/** Upsert a run by id (newest write wins) and keep the list newest-first. */
export function recordRun(entry: RunListItem): void {
  const file = indexPath()
  mkdirSync(path.dirname(file), { recursive: true })
  const existing = listIndexedRuns().filter((r) => r.id !== entry.id)
  const next = [entry, ...existing].sort((a, b) => b.startedAt - a.startedAt)
  try {
    writeFileSync(file, JSON.stringify(next, null, 2))
  } catch {
    // best-effort persistence — a failed write must not break a run
  }
}

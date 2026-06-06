import { spawn, type ChildProcess } from "node:child_process"
import { EventEmitter } from "node:events"
import { createInterface } from "node:readline"
import { randomUUID } from "node:crypto"
import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { buildKgConfig, type RunRequest } from "@/lib/kg-options"
import { listIndexedRuns, recordRun } from "@/server/run-store"
import type {
  LogLine,
  ProgressEvent,
  RunListItem,
  RunState,
  RunSummary,
  StreamLine,
} from "@/types"

const LOG_CAP = 1000

export interface RunRecord {
  summary: RunSummary
  logs: LogLine[]
  child: ChildProcess
  bus: EventEmitter
  sigintSent: boolean
  /** Original request — carries config (input/model/format) for the runs list. */
  req: RunRequest
  /** Absolute output path the CLI was told to write (graph source). */
  resolvedOutput: string
}

// Survive Next dev hot-reload: a fresh module instance would orphan running
// children and lose their state, so the registry lives on globalThis.
const globalForRuns = globalThis as unknown as {
  __kgRuns?: Map<string, RunRecord>
}
const runs: Map<string, RunRecord> =
  globalForRuns.__kgRuns ?? (globalForRuns.__kgRuns = new Map())

const TERMINAL: RunState[] = ["completed", "failed", "cancelled"]
function isTerminal(state: RunState): boolean {
  return TERMINAL.includes(state)
}

/** Repo root that holds the kg-gen CLI. Next runs with cwd = `frontend/`. */
function repoCwd(): string {
  return process.env.KG_GEN_CWD || path.resolve(process.cwd(), "..")
}
/**
 * How to launch the CLI. Defaults to the built binary — a single node process,
 * so one SIGINT reaches the CLI's graceful-shutdown handler directly. (An `npx`
 * wrapper would forward the signal too, double-counting it into a force-quit.)
 * Requires `npm run build` in the repo root; override with KG_GEN_CMD to point
 * at a ts-node invocation if you prefer running from source.
 */
function launchCmd(): string[] {
  return (process.env.KG_GEN_CMD || "node dist/index.js").split(/\s+/)
}

/**
 * Resolve the output to an absolute path so the graph (and its checkpoint
 * sidecar) never land in the kg-gen repo root via the CLI's cwd. An absolute
 * output is used as-is; a relative one resolves against the input directory.
 */
function resolveOutputPath(input: string, output: string): string {
  if (path.isAbsolute(output)) return output
  const inputAbs = path.resolve(repoCwd(), input)
  return path.resolve(inputAbs, output)
}

export function listRuns(): RunSummary[] {
  return [...runs.values()]
    .map((r) => r.summary)
    .sort((a, b) => b.startedAt - a.startedAt)
}

/** A registry record as a config-enriched list item. */
function toListItem(record: RunRecord): RunListItem {
  return {
    ...record.summary,
    input: record.req.input,
    model: record.req.model,
    provider: record.req.provider,
    exportFormat: record.req.exportFormat,
  }
}

/**
 * All known runs for the runs list: live registry records (current, may be
 * running) merged over the persisted index (historical), deduped by id.
 */
export function listAllRuns(): RunListItem[] {
  const live = new Map<string, RunListItem>()
  for (const record of runs.values()) live.set(record.summary.id, toListItem(record))
  const merged = [...live.values()]
  for (const entry of listIndexedRuns()) {
    if (!live.has(entry.id)) merged.push(entry)
  }
  return merged.sort((a, b) => b.startedAt - a.startedAt)
}

export function getRun(id: string): RunRecord | undefined {
  return runs.get(id)
}

/** Resolve a run's output graph path from the registry or the persisted index. */
export function getRunOutput(id: string): string | undefined {
  const record = runs.get(id)
  if (record) return record.summary.output ?? record.resolvedOutput
  return listIndexedRuns().find((r) => r.id === id)?.output
}

export function startRun(req: RunRequest): RunSummary {
  const id = randomUUID().slice(0, 8)

  // The CLI runs with cwd = repo root, so a *relative* output (the form default
  // is "knowledge-graph.json") — and its "<output>.checkpoint.jsonl" sidecar —
  // would land in the kg-gen project root. Resolve it to an absolute path next
  // to the input directory instead, where a project's graph is expected to live.
  const config = buildKgConfig(req)
  const resolvedOutput = resolveOutputPath(req.input, req.output)
  config.output = resolvedOutput

  // Write the request as a temp JSON config; the CLI reads it via --config so
  // array fields (filter/exclude) and nested groups survive intact.
  const dir = mkdtempSync(path.join(tmpdir(), "kg-gen-run-"))
  const cfgPath = path.join(dir, "config.json")
  writeFileSync(cfgPath, JSON.stringify(config, null, 2))

  const [bin, ...baseArgs] = launchCmd()
  const args = [...baseArgs, "--config", cfgPath, "--progress-ndjson"]

  const child = spawn(bin, args, {
    cwd: repoCwd(),
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env },
  })

  const summary: RunSummary = {
    id,
    state: "pending",
    filesDone: 0,
    filesTotal: 0,
    entities: 0,
    relations: 0,
    startedAt: Date.now(),
  }
  const record: RunRecord = {
    summary,
    logs: [],
    child,
    bus: new EventEmitter(),
    sigintSent: false,
    req,
    resolvedOutput,
  }
  record.bus.setMaxListeners(0)
  runs.set(id, record)

  if (child.stdout) {
    createInterface({ input: child.stdout }).on("line", (line) =>
      handleLine(record, line)
    )
  }
  if (child.stderr) {
    createInterface({ input: child.stderr }).on("line", (line) =>
      pushLog(record, { ts: Date.now(), level: "error", message: line })
    )
  }

  child.on("error", (err) => {
    pushLog(record, {
      ts: Date.now(),
      level: "error",
      message: `Failed to launch kg-gen: ${err.message}`,
    })
    finalize(record, "failed", err.message)
  })

  child.on("exit", (code, signal) => {
    if (isTerminal(record.summary.state)) {
      emitEnd(record)
      return
    }
    // No done/error event arrived (crash or hard kill) — infer from exit.
    if (signal === "SIGKILL") finalize(record, "cancelled")
    else if (code === 0) finalize(record, "completed")
    else finalize(record, "failed", `exited with code ${code ?? signal}`)
  })

  return summary
}

export function cancelRun(id: string): boolean {
  const record = runs.get(id)
  if (!record || isTerminal(record.summary.state)) return false
  try {
    if (!record.sigintSent) {
      record.sigintSent = true
      // Graceful: finish the in-flight chunk, checkpoint, flush a partial graph.
      record.child.kill("SIGINT")
    } else {
      // Second request: force-quit.
      record.child.kill("SIGKILL")
    }
    return true
  } catch {
    return false
  }
}

// --- internals ---------------------------------------------------------------

function handleLine(record: RunRecord, line: string): void {
  const trimmed = line.trim()
  if (!trimmed) return
  let parsed: StreamLine
  try {
    parsed = JSON.parse(trimmed) as StreamLine
  } catch {
    // Non-JSON noise (e.g. an early pretty-printed line) — ignore defensively.
    return
  }
  if (parsed.channel === "log") {
    pushLog(record, {
      ts: parsed.ts,
      level: parsed.level,
      message: parsed.message,
    })
  } else if (parsed.channel === "progress") {
    applyEvent(record, parsed.event)
  }
}

function applyEvent(record: RunRecord, ev: ProgressEvent): void {
  const s = record.summary
  switch (ev.type) {
    case "discovery":
      s.state = "running"
      s.filesTotal = ev.totalFiles
      break
    case "file_start":
      s.currentFile = ev.path
      s.filesDone = ev.index - 1
      break
    case "chunk_start":
      s.currentFile = ev.path
      s.chunk = ev.chunk
      s.chunkTotal = ev.totalChunks
      break
    case "chunk_complete":
      // Running (pre-merge) tallies for smooth live counters.
      s.entities += ev.entities
      s.relations += ev.relations
      break
    case "file_complete":
      s.filesDone = ev.index
      break
    case "merge":
      break
    case "export":
      // Final, post-merge counts.
      s.output = ev.output
      s.entities = ev.entities
      s.relations = ev.relations
      break
    case "done":
      s.output = ev.output
      s.entities = ev.entities
      s.relations = ev.relations
      finalize(record, ev.interrupted ? "cancelled" : "completed")
      return
    case "error":
      finalize(record, "failed", ev.message)
      return
  }
  emitSummary(record)
}

function pushLog(record: RunRecord, log: LogLine): void {
  record.logs.push(log)
  if (record.logs.length > LOG_CAP) {
    record.logs.splice(0, record.logs.length - LOG_CAP)
  }
  record.bus.emit("log", log)
}

function emitSummary(record: RunRecord): void {
  record.bus.emit("summary", record.summary)
}

function emitEnd(record: RunRecord): void {
  record.bus.emit("end", record.summary)
}

function finalize(record: RunRecord, state: RunState, error?: string): void {
  if (isTerminal(record.summary.state)) return
  record.summary.state = state
  record.summary.endedAt = Date.now()
  if (error) record.summary.error = error
  emitSummary(record)
  emitEnd(record)
  // Persist to the run index so the run survives a server restart. Best-effort.
  try {
    recordRun(toListItem(record))
  } catch {
    // never let persistence break a run
  }
}

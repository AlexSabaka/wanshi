"use client"

import { useEffect, useState } from "react"
import type { LogLine, RunSummary } from "@/types"

interface RunStream {
  summary: RunSummary | null
  logs: LogLine[]
  connected: boolean
}

/**
 * Subscribe to a run's live progress via Server-Sent Events. The server replays
 * buffered state on connect, so this is correct even when opened mid-run or
 * after completion.
 */
export function useRunStream(id: string): RunStream {
  const [summary, setSummary] = useState<RunSummary | null>(null)
  const [logs, setLogs] = useState<LogLine[]>([])
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    setSummary(null)
    setLogs([])
    const es = new EventSource(`/api/runs/${id}/stream`)

    es.addEventListener("open", () => setConnected(true))
    es.addEventListener("summary", (e) =>
      setSummary(JSON.parse((e as MessageEvent).data))
    )
    es.addEventListener("log", (e) =>
      setLogs((prev) => {
        const next = [...prev, JSON.parse((e as MessageEvent).data) as LogLine]
        return next.length > 1000 ? next.slice(-1000) : next
      })
    )
    es.addEventListener("end", (e) => {
      setSummary(JSON.parse((e as MessageEvent).data))
      setConnected(false)
      es.close()
    })
    es.onerror = () => setConnected(false)

    return () => es.close()
  }, [id])

  return { summary, logs, connected }
}

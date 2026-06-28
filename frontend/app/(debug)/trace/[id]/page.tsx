"use client"

import { Suspense, useMemo, useState } from "react"
import { useParams, useSearchParams } from "next/navigation"
import { Loader2, Search, AlertTriangle, Activity } from "lucide-react"
import { PageHeader } from "@/components/layout/page-header"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { TypeChip } from "@/components/type-chip"
import { LineagePanel } from "@/components/trace/lineage-panel"
import { useTrace } from "@/hooks/use-trace"
import { ApiError } from "@/lib/api"
import { TRACE_VERSION } from "@/lib/trace"
import { listTraceEntities, reconstructLineage, stageCounts } from "@/lib/trace-lineage"
import { basename, cn } from "@/lib/utils"

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex h-[calc(100dvh-9rem)] items-center justify-center">{children}</div>
}

function TraceView({ runId }: { runId: string }) {
  const { data, isLoading, error } = useTrace(runId)
  const sp = useSearchParams()
  const [selected, setSelected] = useState<string | null>(null)
  const [q, setQ] = useState("")

  const records = useMemo(() => data?.trace ?? [], [data])
  const entities = useMemo(() => listTraceEntities(records), [records])
  const counts = useMemo(() => stageCounts(records), [records])
  const active = selected ?? sp.get("entity") ?? entities[0]?.name ?? null
  const lineage = useMemo(
    () => (active ? reconstructLineage(records, active) : null),
    [records, active]
  )

  if (isLoading) {
    return (
      <Centered>
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </Centered>
    )
  }

  if (error || !data) {
    const noTrace = error instanceof ApiError && error.status === 404
    return (
      <div>
        <PageHeader title="Trace inspector" description={`Run ${runId}`} />
        <Centered>
          <Card className="max-w-md">
            <CardContent className="space-y-2 py-8 text-center text-sm text-muted-foreground">
              <Activity className="mx-auto h-7 w-7" />
              <p>
                {noTrace
                  ? "No debug trace was captured for this run."
                  : error instanceof Error
                    ? error.message
                    : "Trace not available."}
              </p>
              {noTrace && (
                <p className="text-xs">
                  Re-run with <code className="rounded bg-muted px-1">--trace</code> (or{" "}
                  <code className="rounded bg-muted px-1">trace.enabled: true</code>) to capture the
                  pipeline&apos;s decisions.
                </p>
              )}
            </CardContent>
          </Card>
        </Centered>
      </div>
    )
  }

  const versionDrift = (data.versions ?? []).some((v) => v !== TRACE_VERSION)
  const filtered = q
    ? entities.filter((e) => e.name.toLowerCase().includes(q.toLowerCase()))
    : entities

  return (
    <div className="flex h-[calc(100dvh-7rem)] flex-col gap-3">
      <div className="min-w-0">
        <h1 className="text-xl font-bold tracking-tight">Trace inspector</h1>
        <p className="truncate text-xs text-muted-foreground" title={data.path}>
          {basename(data.path)} · {records.length} events ·{" "}
          {Object.entries(counts)
            .map(([s, n]) => `${n} ${s}`)
            .join(" · ")}
        </p>
      </div>

      {versionDrift && (
        <div className="flex items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-2.5 py-1.5 text-xs">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600" />
          Trace schema version {data.versions.join(", ")} differs from the expected {TRACE_VERSION} —
          some fields may not render.
        </div>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 md:grid-cols-[18rem_1fr]">
        {/* entity picker */}
        <div className="flex min-h-0 flex-col rounded-xl border bg-card">
          <div className="border-b p-2">
            <div className="relative">
              <Search className="absolute left-2 top-2 h-4 w-4 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Find entity…"
                className="h-8 pl-8"
              />
            </div>
          </div>
          <ul className="min-h-0 flex-1 overflow-auto p-1.5">
            {filtered.length === 0 ? (
              <li className="px-2 py-3 text-xs text-muted-foreground">No entities in this trace.</li>
            ) : (
              filtered.map((e) => (
                <li key={e.name}>
                  <button
                    type="button"
                    onClick={() => setSelected(e.name)}
                    className={cn(
                      "flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent",
                      active === e.name && "bg-accent"
                    )}
                  >
                    <span className="inline-flex min-w-0 items-center gap-1.5">
                      <TypeChip type={e.entityType} className="shrink-0 text-xs" />
                      <span className="truncate" title={e.name}>
                        {e.name}
                      </span>
                    </span>
                    <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                      {e.mentionCount}×
                    </span>
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>

        {/* lineage */}
        <div className="min-h-0 overflow-auto rounded-xl border bg-card p-4">
          {lineage ? (
            <LineagePanel lineage={lineage} />
          ) : (
            <p className="text-sm text-muted-foreground">
              Select an entity to reconstruct its lineage.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

function TracePageInner() {
  const { id } = useParams<{ id: string }>()
  return <TraceView runId={id} />
}

export default function TraceInspectorPage() {
  return (
    <Suspense
      fallback={
        <Centered>
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </Centered>
      }
    >
      <TracePageInner />
    </Suspense>
  )
}

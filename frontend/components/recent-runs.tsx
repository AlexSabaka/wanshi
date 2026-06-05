"use client"

import Link from "next/link"
import { useRuns } from "@/hooks/use-runs"
import { RunStateBadge } from "@/components/run-state-badge"
import { Card, CardContent } from "@/components/ui/card"
import { basename } from "@/lib/utils"

export function RecentRuns() {
  const { data: runs, isLoading } = useRuns()

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          Loading…
        </CardContent>
      </Card>
    )
  }

  if (!runs || runs.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          No runs yet. Start one to see live progress here.
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-2">
      {runs.map((run) => (
        <Link key={run.id} href={`/runs/${run.id}`} className="block">
          <Card className="py-3 transition-colors hover:bg-accent/40">
            <CardContent className="flex items-center gap-4 px-4">
              <span className="font-mono text-xs text-muted-foreground">
                {run.id}
              </span>
              <span className="flex-1 truncate text-sm">
                {run.currentFile ? basename(run.currentFile) : "—"}
              </span>
              <span className="text-xs tabular-nums text-muted-foreground">
                {run.filesDone}/{run.filesTotal} files · {run.entities}e ·{" "}
                {run.relations}r
              </span>
              <RunStateBadge state={run.state} />
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  )
}

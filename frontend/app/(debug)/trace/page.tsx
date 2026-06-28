"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { Activity } from "lucide-react"
import { PageHeader } from "@/components/layout/page-header"
import { Card, CardContent } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useRuns } from "@/hooks/use-runs"
import { basename } from "@/lib/utils"

/**
 * Debug-mode landing: pick a run to reconstruct its lineage. The trace itself is
 * opt-in (the run must have been launched with `--trace`); the inspector handles
 * a missing sidecar with guidance, so any completed run is offered here.
 */
export default function TracePicker() {
  const router = useRouter()
  const { data: runs } = useRuns()
  const candidates = (runs ?? []).filter((r) => r.state === "completed" && !!r.output)

  return (
    <div>
      <PageHeader
        title="Trace inspector"
        description="Reconstruct how a node was built — chunk → extraction → grounding → merge."
      />
      <div className="flex h-[calc(100dvh-12rem)] items-center justify-center">
        <Card className="w-full max-w-md">
          <CardContent className="space-y-4 py-8 text-center">
            <Activity className="mx-auto h-8 w-8 text-muted-foreground" />
            {candidates.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No completed runs yet.{" "}
                <Link href="/run" className="underline underline-offset-4">
                  Start a run
                </Link>{" "}
                with <code className="rounded bg-muted px-1">--trace</code> to inspect its lineage.
              </p>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">Pick a run to inspect.</p>
                <Select onValueChange={(id) => router.push(`/trace/${id}`)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a run…" />
                  </SelectTrigger>
                  <SelectContent>
                    {candidates.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.input ? basename(r.input) : r.id} · {r.entities}e/{r.relations}r
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

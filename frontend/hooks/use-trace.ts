"use client"

import { useQuery } from "@tanstack/react-query"
import { apiGet } from "@/lib/api"
import type { TraceRecord } from "@/lib/trace"

/**
 * Fetch a run's debug-trace sidecar. A completed trace is an immutable static
 * file (no streaming), so cache it indefinitely. A 404 (no trace captured) is a
 * normal state the view handles, so don't retry it.
 */
export function useTrace(runId: string | null) {
  return useQuery({
    queryKey: ["trace", runId],
    queryFn: () =>
      apiGet<{ trace: TraceRecord[]; versions: number[]; path: string }>(
        `/api/runs/${runId}/trace`
      ),
    enabled: !!runId,
    staleTime: Infinity,
    retry: false,
  })
}

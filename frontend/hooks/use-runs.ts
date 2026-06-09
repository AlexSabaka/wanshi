"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { apiGet, apiPost } from "@/lib/api"
import type { KgGenConfig } from "@/lib/kg-options"
import type { RunListItem, RunSummary } from "@/types"

export function useRuns(poll = true) {
  return useQuery({
    queryKey: ["runs"],
    queryFn: () => apiGet<{ runs: RunListItem[] }>("/api/runs"),
    refetchInterval: poll ? 3000 : false,
    select: (d) => d.runs,
  })
}

export function useStartRun() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (config: KgGenConfig) =>
      apiPost<{ run: RunSummary }>("/api/runs", config),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["runs"] }),
  })
}

export async function cancelRun(id: string): Promise<boolean> {
  const res = await apiPost<{ ok: boolean }>(`/api/runs/${id}/cancel`)
  return res.ok
}

export type RerunMode = "resume" | "restart"

/** Re-run a past run from its stored config (resume = continue, restart = fresh). */
export function useRerun() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, mode }: { id: string; mode: RerunMode }) =>
      apiPost<{ run: RunSummary }>(`/api/runs/${id}/rerun`, { mode }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["runs"] }),
  })
}

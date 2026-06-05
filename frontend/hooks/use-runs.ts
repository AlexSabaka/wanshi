"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { apiGet, apiPost } from "@/lib/api"
import type { RunRequest } from "@/lib/kg-options"
import type { RunSummary } from "@/types"

export function useRuns(poll = true) {
  return useQuery({
    queryKey: ["runs"],
    queryFn: () => apiGet<{ runs: RunSummary[] }>("/api/runs"),
    refetchInterval: poll ? 3000 : false,
    select: (d) => d.runs,
  })
}

export function useStartRun() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (req: RunRequest) =>
      apiPost<{ run: RunSummary }>("/api/runs", req),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["runs"] }),
  })
}

export async function cancelRun(id: string): Promise<boolean> {
  const res = await apiPost<{ ok: boolean }>(`/api/runs/${id}/cancel`)
  return res.ok
}

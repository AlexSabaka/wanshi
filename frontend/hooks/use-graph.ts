"use client"

import { useQuery } from "@tanstack/react-query"
import { apiGet } from "@/lib/api"
import type { KnowledgeGraph } from "@/types"

/**
 * Fetch a run's normalized knowledge graph. Graphs are immutable once written,
 * so cache them indefinitely.
 */
export function useGraph(runId: string | null) {
  return useQuery({
    queryKey: ["graph", runId],
    queryFn: () =>
      apiGet<{ graph: KnowledgeGraph; output: string }>(
        `/api/runs/${runId}/graph`
      ),
    enabled: !!runId,
    staleTime: Infinity,
    retry: false,
  })
}

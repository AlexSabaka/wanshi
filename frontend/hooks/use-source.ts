"use client"

import { useQuery } from "@tanstack/react-query"
import { apiGet } from "@/lib/api"
import type { SourcePayload } from "@/server/source-loader"

/**
 * What to open in the source view, with a graded highlight strategy:
 * `exact` (a verbatim span, e.g. a citation's supportingSpan) is tried first,
 * then `searchSpan` (a relation's sourceSpan), then `fuzzyText` (the
 * observation text — usually a paraphrase, so matched fuzzily).
 */
export interface SourceTarget {
  source: string
  locator?: string
  fuzzyText?: string
  exact?: string
  searchSpan?: string
}

/**
 * Fetch a fact's source content (sandboxed to the run's input dir). Sources are
 * immutable once written, so cache indefinitely; a 403/404 is a normal state the
 * view renders, not a retryable error.
 */
export function useSource(runId: string | null, target: SourceTarget | null) {
  return useQuery({
    queryKey: ["source", runId, target?.source, target?.locator],
    queryFn: () => {
      const qs = new URLSearchParams({ path: target!.source })
      if (target!.locator) qs.set("locator", target!.locator)
      return apiGet<SourcePayload>(`/api/runs/${runId}/source?${qs.toString()}`)
    },
    enabled: !!runId && !!target?.source,
    staleTime: Infinity,
    retry: false,
  })
}

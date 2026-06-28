"use client"

import { useEffect, useMemo, useRef } from "react"
import { X, FileText, MapPin, AlertTriangle, ShieldAlert, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useSource, type SourceTarget } from "@/hooks/use-source"
import { ApiError } from "@/lib/api"
import { locatorLabel, parseLocator } from "@/lib/locator"
import { basename, cn } from "@/lib/utils"

/**
 * The source / provenance view — a fact's claim shown next to the original.
 * Opens the cited source (sandboxed server-side to the run's input dir) and
 * highlights the span the claim rests on: a verbatim `exact`/`searchSpan` if it
 * occurs, else a fuzzy match on the observation text (a paraphrase). Read-only.
 */
export function SourceView({
  runId,
  target,
  onClose,
  className,
}: {
  runId: string
  target: SourceTarget
  onClose: () => void
  className?: string
}) {
  const { data, isLoading, error } = useSource(runId, target)
  const locator = parseLocator(target.locator)
  const locLabel = locatorLabel(locator)

  return (
    <div
      className={cn(
        "pointer-events-auto flex h-full w-[28rem] max-w-[42vw] flex-col overflow-hidden rounded-xl border bg-card/95 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-card/80",
        className
      )}
    >
      <div className="flex items-start justify-between gap-2 border-b px-4 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <FileText className="h-3.5 w-3.5 shrink-0" /> Source
          </div>
          <div className="mt-1 truncate font-mono text-sm" title={target.source}>
            {basename(target.source)}
          </div>
          {locLabel && (
            <div className="mt-0.5 inline-flex items-center gap-1 font-mono text-[11px] text-muted-foreground">
              <MapPin className="h-3 w-3 shrink-0 opacity-70" /> {locLabel}
            </div>
          )}
        </div>
        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close source view">
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex-1 overflow-auto">
        {isLoading && (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading source…
          </div>
        )}
        {error && <SourceError error={error} />}
        {data && !isLoading && <SourceBody data={data} target={target} />}
      </div>
    </div>
  )
}

function SourceError({ error }: { error: unknown }) {
  const status = error instanceof ApiError ? error.status : undefined
  const message = error instanceof Error ? error.message : "Failed to read source"
  const sandbox = status === 403
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
      {sandbox ? (
        <ShieldAlert className="h-6 w-6 text-[var(--color-trust-ungrounded)]" />
      ) : (
        <AlertTriangle className="h-6 w-6 text-muted-foreground" />
      )}
      <p className="text-sm font-medium">
        {sandbox ? "Blocked — outside the run's input directory" : status === 404 ? "Source not found" : "Couldn't open source"}
      </p>
      <p className="max-w-xs text-xs text-muted-foreground">{message}</p>
    </div>
  )
}

function SourceBody({
  data,
  target,
}: {
  data: NonNullable<ReturnType<typeof useSource>["data"]>
  target: SourceTarget
}) {
  if (data.kind === "image") {
    return (
      <div className="space-y-2 p-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={data.dataUrl} alt={basename(data.path)} className="mx-auto max-h-full rounded-md border" />
        {data.locator?.kind === "gps" && (
          <p className="text-center text-[11px] text-muted-foreground">GPS coordinate observation — see the fact for lat/lng.</p>
        )}
      </div>
    )
  }

  if (data.kind === "unviewable") {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
        <FileText className="h-6 w-6 text-muted-foreground" />
        <p className="max-w-xs text-xs text-muted-foreground">{data.note}</p>
      </div>
    )
  }

  return <TextSource text={data.text} note={data.note} target={target} />
}

function TextSource({
  text,
  note,
  target,
}: {
  text: string
  note?: string
  target: SourceTarget
}) {
  const markRef = useRef<HTMLElement>(null)
  const range = useMemo(() => findHighlight(text, target), [text, target])

  useEffect(() => {
    markRef.current?.scrollIntoView({ block: "center", behavior: "smooth" })
  }, [range])

  const before = range ? text.slice(0, range[0]) : text
  const hit = range ? text.slice(range[0], range[1]) : ""
  const after = range ? text.slice(range[1]) : ""

  return (
    <div className="flex h-full flex-col">
      {(note || !range) && (
        <div className="border-b bg-muted/30 px-3 py-1.5 text-[11px] text-muted-foreground">
          {note}
          {note && !range ? " · " : ""}
          {!range && "no exact span located — showing the full source"}
        </div>
      )}
      <pre className="flex-1 overflow-auto whitespace-pre-wrap break-words px-3 py-2 font-mono text-xs leading-relaxed">
        {before}
        {range && (
          <mark
            ref={markRef}
            className="rounded-sm px-0.5"
            style={{
              backgroundColor: "color-mix(in srgb, var(--color-ring) 30%, transparent)",
              color: "inherit",
            }}
          >
            {hit}
          </mark>
        )}
        {after}
      </pre>
    </div>
  )
}

// --- highlight resolution (pure) --------------------------------------------

const STOPWORDS = new Set([
  "the", "and", "for", "are", "was", "were", "with", "that", "this", "have",
  "has", "had", "not", "but", "you", "your", "from", "they", "them", "their",
  "what", "when", "which", "who", "will", "would", "there", "here", "about",
])

function tokenize(s: string): string[] {
  return (s.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter(
    (t) => t.length >= 3 && !STOPWORDS.has(t)
  )
}

/**
 * Locate the span to highlight: a verbatim `exact`/`searchSpan` occurrence
 * first, else the single line with the highest token overlap against
 * `fuzzyText` (the observation, usually a paraphrase). Returns char offsets, or
 * null when nothing matches well enough.
 */
function findHighlight(content: string, target: SourceTarget): [number, number] | null {
  for (const span of [target.exact, target.searchSpan]) {
    const needle = span?.trim()
    if (needle) {
      const i = content.indexOf(needle)
      if (i >= 0) return [i, i + needle.length]
    }
  }

  const qTokens = new Set(tokenize(target.fuzzyText ?? ""))
  if (qTokens.size === 0) return null

  let offset = 0
  let best = { score: 0, start: -1, end: -1 }
  for (const line of content.split("\n")) {
    const seen = new Set<string>()
    for (const t of tokenize(line)) if (qTokens.has(t)) seen.add(t)
    if (seen.size > best.score) best = { score: seen.size, start: offset, end: offset + line.length }
    offset += line.length + 1 // + the newline
  }
  const need = Math.min(2, qTokens.size)
  return best.score >= need && best.start >= 0 ? [best.start, best.end] : null
}

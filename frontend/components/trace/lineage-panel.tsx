"use client"

import { FileText, Boxes, ShieldQuestion, GitMerge, AlertTriangle } from "lucide-react"
import { trustVar } from "@/lib/graph-colors"
import { basename, cn } from "@/lib/utils"
import type { NodeLineage } from "@/lib/trace-lineage"

/** grounding decision → the trust-color seam (so it reads like the rest). */
const DECISION_TRUST = {
  accept: "grounded",
  flag: "uncertain",
  drop: "ungrounded",
} as const

function Section({
  icon: Icon,
  title,
  count,
  children,
}: {
  icon: typeof FileText
  title: string
  count: number
  children: React.ReactNode
}) {
  return (
    <section>
      <h4 className="mb-1.5 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        <Icon className="h-3 w-3" /> {title} ({count})
      </h4>
      {count === 0 ? <p className="text-xs text-muted-foreground">None.</p> : children}
    </section>
  )
}

export function LineagePanel({ lineage }: { lineage: NodeLineage }) {
  const forms = new Set(lineage.surfaceForms)
  const chunkOf = new Map(lineage.chunks.map((c) => [c.chunkId, c]))

  return (
    <div className="space-y-5 text-sm">
      <div>
        <div className="text-base font-semibold">{lineage.name}</div>
        {lineage.surfaceForms.length > 1 && (
          <div className="mt-1 flex flex-wrap gap-1 text-xs text-muted-foreground">
            <span>folds:</span>
            {lineage.surfaceForms.map((f) => (
              <span key={f} className="rounded bg-muted px-1.5 py-0.5 font-mono">
                {f}
              </span>
            ))}
          </div>
        )}
      </div>

      {lineage.partial && (
        <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-2.5 py-2 text-xs">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
          <span>
            Lineage is <strong>partial</strong> — a resumed run skips checkpointed chunks, so some
            extraction steps may be absent from this trace.
          </span>
        </div>
      )}

      <Section icon={Boxes} title="Extractions" count={lineage.extractions.length}>
        <ul className="space-y-2">
          {lineage.extractions.map((ex) => {
            const ch = chunkOf.get(ex.chunkId)
            const mentions = ex.entityMentions.filter((m) => forms.has(m.name))
            return (
              <li key={ex.extractionId} className="rounded-md border px-2.5 py-2">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="inline-flex min-w-0 items-center gap-1.5">
                    <FileText className="h-3 w-3 shrink-0 text-muted-foreground" />
                    <span className="truncate font-mono" title={ch?.file ?? ex.file}>
                      {basename(ch?.file ?? ex.file)}
                    </span>
                    {ch && (
                      <span className="shrink-0 text-muted-foreground">
                        #{ch.chunkIndex + 1}/{ch.totalChunks}
                      </span>
                    )}
                  </span>
                  {ex.checkpointHit && (
                    <span className="shrink-0 rounded bg-muted px-1 text-[10px] text-muted-foreground">
                      checkpoint
                    </span>
                  )}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                  <span className="font-mono">{ex.model}</span>
                  <span>· {ex.promptVersion}</span>
                  <span>· attempt {ex.attempt}</span>
                  {ex.failed && <span className="text-destructive">· failed</span>}
                  {ex.usage?.totalTokens != null && (
                    <span>· {ex.usage.totalTokens} tok</span>
                  )}
                </div>
                {mentions.map((m) => (
                  <div key={m.mentionId} className="mt-1 text-xs">
                    <span className="font-medium">{m.name}</span>{" "}
                    <span className="text-muted-foreground">
                      ({m.entityType} · {m.observationIds.length} obs)
                    </span>
                  </div>
                ))}
              </li>
            )
          })}
        </ul>
      </Section>

      <Section icon={ShieldQuestion} title="Grounding decisions" count={lineage.grounding.length}>
        <ul className="space-y-1.5">
          {lineage.grounding.map((g, i) => {
            const trust = DECISION_TRUST[g.decision]
            return (
              <li key={i} className="rounded-md border px-2.5 py-1.5">
                <div className="flex items-center justify-between gap-2 text-[11px]">
                  <span className="inline-flex items-center gap-1.5">
                    <span
                      className="inline-block size-2 rounded-full"
                      style={{ backgroundColor: trustVar(trust) }}
                    />
                    <span className="font-medium uppercase tracking-wide">{g.decision}</span>
                    <span className="text-muted-foreground">{g.kind}</span>
                  </span>
                  <span className="tabular-nums text-muted-foreground">
                    {g.checker} {g.score.toFixed(2)}
                  </span>
                </div>
                <p className="mt-0.5 leading-snug text-muted-foreground">{g.claim}</p>
              </li>
            )
          })}
        </ul>
      </Section>

      <Section icon={GitMerge} title="Merge decisions" count={lineage.merges.length}>
        <ul className="space-y-1.5">
          {lineage.merges.map((m) => (
            <li key={m.mergeDecisionId} className="rounded-md border px-2.5 py-1.5 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-medium" title={m.canonical}>
                  {m.canonical}
                </span>
                <span
                  className={cn(
                    "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase",
                    m.verdict === "accept"
                      ? "bg-muted text-foreground"
                      : "bg-transparent text-muted-foreground"
                  )}
                >
                  {m.verdict === "accept" ? "merged" : "kept distinct"}
                </span>
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
                <span>{m.method}</span>
                {typeof m.cosine === "number" && <span>· cos {m.cosine.toFixed(2)}</span>}
                {typeof m.jaroWinkler === "number" && <span>· jw {m.jaroWinkler.toFixed(2)}</span>}
                {m.adjudicated && (
                  <span>· adjudicator {m.adjudicatorVerdict ? "yes" : "no"}</span>
                )}
                {m.digitVeto && <span>· digit-veto</span>}
              </div>
              {m.surfaceForms.length > 1 && (
                <div className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">
                  {m.surfaceForms.join(" · ")}
                </div>
              )}
            </li>
          ))}
        </ul>
      </Section>
    </div>
  )
}

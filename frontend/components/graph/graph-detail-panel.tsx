"use client"

import { X, FileText, GitBranch } from "lucide-react"
import { Button } from "@/components/ui/button"
import { TypeChip } from "@/components/type-chip"
import { basename } from "@/lib/utils"
import type { Entity } from "@/types"

export interface Neighbor {
  name: string
  entityType: string
}

export function GraphDetailPanel({
  name,
  entity,
  entityType,
  neighbors,
  onClose,
  onSelectNeighbor,
}: {
  entity?: Entity
  /** Falls back to this when the node is an unresolved relation endpoint. */
  entityType: string
  neighbors: Neighbor[]
  name: string
  onClose: () => void
  onSelectNeighbor: (name: string) => void
}) {
  return (
    <div className="pointer-events-auto flex h-full w-80 flex-col overflow-hidden rounded-xl border bg-card/95 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-card/80">
      <div className="flex items-start justify-between gap-2 border-b px-4 py-3">
        <div className="min-w-0">
          <div className="truncate font-semibold leading-tight">{name}</div>
          <TypeChip type={entityType} className="mt-1 text-xs text-muted-foreground" />
        </div>
        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close">
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex-1 space-y-5 overflow-auto px-4 py-3 text-sm">
        {!entity ? (
          <p className="text-xs text-muted-foreground">
            Unresolved entity — referenced by a relation but not extracted on its own.
          </p>
        ) : (
          <>
            <section>
              <h4 className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Observations ({entity.observations.length})
              </h4>
              {entity.observations.length === 0 ? (
                <p className="text-xs text-muted-foreground">None.</p>
              ) : (
                <ul className="space-y-2">
                  {entity.observations.map((o, i) => (
                    <li key={i} className="border-l-2 border-border pl-2.5">
                      <p className="leading-snug">{o.text}</p>
                      {(o.source || o.createdAt) && (
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          {o.source ? basename(o.source) : ""}
                          {o.createdAt ? ` · ${new Date(o.createdAt).toLocaleDateString()}` : ""}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {entity.files.length > 0 && (
              <section>
                <h4 className="mb-1.5 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <FileText className="h-3 w-3" /> Files
                </h4>
                <ul className="space-y-1">
                  {entity.files.map((f) => (
                    <li key={f} className="truncate font-mono text-xs text-muted-foreground" title={f}>
                      {basename(f)}
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}

        <section>
          <h4 className="mb-1.5 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <GitBranch className="h-3 w-3" /> Neighbors ({neighbors.length})
          </h4>
          {neighbors.length === 0 ? (
            <p className="text-xs text-muted-foreground">None.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {neighbors.map((n) => (
                <button
                  key={n.name}
                  type="button"
                  onClick={() => onSelectNeighbor(n.name)}
                  className="inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-colors hover:bg-accent"
                  title={n.entityType}
                >
                  <TypeChip type={n.entityType} />
                  <span className="max-w-[8rem] truncate">{n.name}</span>
                </button>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

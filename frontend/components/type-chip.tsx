import { colorForType } from "@/lib/graph-colors"
import { cn } from "@/lib/utils"

/** A colored dot + label for an entity/relation type. Colors match the graph. */
export function TypeChip({
  type,
  className,
}: {
  type: string
  className?: string
}) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap", className)}>
      <span
        className="inline-block size-2 shrink-0 rounded-full"
        style={{ backgroundColor: colorForType(type) }}
      />
      {type}
    </span>
  )
}

import { Badge } from "@/components/ui/badge"
import type { RunState } from "@/types"

const STATE_STYLES: Record<RunState, string> = {
  pending: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  running: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  completed: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
  failed: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
  cancelled: "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300",
}

export function RunStateBadge({ state }: { state: RunState }) {
  return (
    <Badge
      variant="outline"
      className={`text-xs font-medium border-0 ${STATE_STYLES[state] ?? ""}`}
    >
      {state}
    </Badge>
  )
}

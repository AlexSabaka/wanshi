/**
 * Deterministic categorical color for an entity (or relation) type, so the same
 * type gets the same color across the charts and the graph. Palette is tuned to
 * read on both light and dark backgrounds.
 */
const PALETTE = [
  "#3b82f6", // blue
  "#10b981", // emerald
  "#f59e0b", // amber
  "#8b5cf6", // violet
  "#ef4444", // red
  "#14b8a6", // teal
  "#ec4899", // pink
  "#84cc16", // lime
  "#f97316", // orange
  "#6366f1", // indigo
  "#06b6d4", // cyan
  "#a855f7", // purple
]

function hash(str: string): number {
  let h = 0
  for (let i = 0; i < str.length; i++) {
    h = (h << 5) - h + str.charCodeAt(i)
    h |= 0
  }
  return Math.abs(h)
}

export function colorForType(type: string): string {
  return PALETTE[hash(type) % PALETTE.length]
}

export { PALETTE as TYPE_PALETTE }

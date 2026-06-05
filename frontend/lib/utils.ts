import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDuration(seconds?: number | null): string {
  if (!seconds || seconds <= 0) return "—"
  if (seconds < 60) return `${Math.round(seconds)}s`
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  return s > 0 ? `${m}m ${s}s` : `${m}m`
}

export function formatPercent(value: number | null | undefined): string {
  if (value == null) return "—"
  return `${(value * 100).toFixed(1)}%`
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function formatDate(dateStr: string): string {
  if (!dateStr) return "—"
  try {
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return dateStr
    return d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  } catch {
    return dateStr
  }
}

export function formatTimestamp(epochSeconds: number): string {
  return new Date(epochSeconds * 1000).toLocaleString()
}

export function basename(path: string): string {
  return path.split("/").pop() || path
}

export function stripArchiveExtension(value: string): string {
  return value.replace(/\.(json\.gz|json)$/i, "")
}

export function suffixDisplay(value: string, maxChars = 42): string {
  if (value.length <= maxChars) return value
  return `…${value.slice(-(maxChars - 1))}`
}

export function prefixHint(value: string, maxChars = 28): string | undefined {
  if (value.length <= maxChars) return undefined
  return `${value.slice(0, maxChars - 1)}…`
}

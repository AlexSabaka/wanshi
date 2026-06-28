/**
 * Parse an ECS `locator` string into a structured form the source view can act
 * on. Mirrors the exact formats the core stamps (verified against `src/`):
 *  - `p.<n>`              → a 1-based PDF page (PdfReader/MistralOcrReader/Tesseract)
 *  - `table:<t>/row:<pk>` → a SQLite row (SqliteAdapter)
 *  - `gps`                → an image GPS coordinate observation (imageMetaGraph)
 *  - anything else        → `unknown` (email-msgid, subtitle cue-time, … are
 *                           deferred upstream, so they degrade gracefully here).
 *
 * Pure + dependency-free so both the server loader and the client view share one
 * source of truth for what a locator means.
 */
export type ParsedLocator =
  | { kind: "page"; page: number; raw: string }
  | { kind: "table-row"; table: string; row: string; raw: string }
  | { kind: "gps"; raw: string }
  | { kind: "unknown"; raw: string }

export function parseLocator(locator: string | undefined | null): ParsedLocator | null {
  if (!locator) return null
  const raw = locator.trim()
  if (!raw) return null

  const page = /^p\.(\d+)$/.exec(raw)
  if (page) return { kind: "page", page: Number(page[1]), raw }

  const tableRow = /^table:(.+)\/row:(.+)$/.exec(raw)
  if (tableRow) return { kind: "table-row", table: tableRow[1], row: tableRow[2], raw }

  if (raw === "gps") return { kind: "gps", raw }

  return { kind: "unknown", raw }
}

/** A short human label for a parsed locator (used in the source-view header). */
export function locatorLabel(parsed: ParsedLocator | null): string | null {
  if (!parsed) return null
  switch (parsed.kind) {
    case "page":
      return `page ${parsed.page}`
    case "table-row":
      return `${parsed.table} · row ${parsed.row}`
    case "gps":
      return "GPS coordinate"
    case "unknown":
      return parsed.raw
  }
}

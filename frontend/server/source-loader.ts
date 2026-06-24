import fs from "node:fs"
import path from "node:path"
import { parseLocator, type ParsedLocator } from "@/lib/locator"

/** Path escaped the run's input sandbox → the route maps this to 403. */
export class SandboxError extends Error {}

const MAX_TEXT_BYTES = 2 * 1024 * 1024 // 2 MB of source text is plenty for a viewer
const MAX_IMAGE_BYTES = 12 * 1024 * 1024 // 12 MB cap before we refuse to inline an image
const BINARY_SNIFF_BYTES = 8192 // a NUL in the first 8 KB ⇒ treat as binary

const IMAGE_MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".bmp": "image/bmp",
  ".svg": "image/svg+xml",
}

export type SourcePayload =
  | {
      kind: "text"
      text: string
      mime: string
      path: string
      locator: ParsedLocator | null
      /** Set when the text is a single PDF page pulled from an OCR sidecar. */
      page?: number
      /** A graceful note (e.g. "page jump needs OCR", "truncated"). */
      note?: string
      truncated?: boolean
    }
  | { kind: "image"; dataUrl: string; mime: string; path: string; locator: ParsedLocator | null }
  | { kind: "unviewable"; mime: string; path: string; locator: ParsedLocator | null; note: string }

function fmtBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * Realpath as much of `target` as exists (resolving symlinks) and re-append the
 * non-existent tail, so containment can be checked even for a missing file. A
 * symlink in any existing ancestor is resolved — it can't be used to escape.
 */
function realpathDeep(target: string): string {
  let p = path.resolve(target)
  const tail: string[] = []
  while (!fs.existsSync(p)) {
    const parent = path.dirname(p)
    if (parent === p) break // reached the filesystem root
    tail.unshift(path.basename(p))
    p = parent
  }
  const realExisting = fs.existsSync(p) ? fs.realpathSync(p) : p
  return tail.length ? path.join(realExisting, ...tail) : realExisting
}

/**
 * Reject any source path that doesn't resolve to within `inputDir` (the run's
 * declared input tree) — the security spine of the source view. Resolves
 * symlinks (a symlink can't escape the sandbox), tolerates a not-yet-statted
 * target so an escape is reported as a 403 rather than an incidental 404, and
 * uses `path.relative` rather than a string prefix (so `/a/b` can't be confused
 * with `/a/bee`, nor a sibling named `..foo`). Throws {@link SandboxError} on
 * escape. Returns the resolved (real) path; existence is the caller's to check.
 */
export function assertWithinSandbox(inputDir: string, target: string): string {
  const realBase = fs.realpathSync(inputDir) // input dir must exist
  const resolved = realpathDeep(target)
  const rel = path.relative(realBase, resolved)
  if (rel === ".." || rel.startsWith(".." + path.sep) || path.isAbsolute(rel)) {
    throw new SandboxError(
      `Refusing to read outside the run's input directory: ${target}`
    )
  }
  return resolved
}

/**
 * Read a fact's source for the provenance view, sandboxed to `inputDir`. Shapes
 * the result by kind: text/code/markdown → text; image → data URL; a PDF
 * `p.<n>` locator → that page's text from the `<pdf>.{tesseract,mistral}.json`
 * sidecar when present (else a graceful note); binary/oversize → unviewable.
 */
export function loadSource(
  inputDir: string,
  sourcePath: string,
  locator?: string
): SourcePayload {
  const parsed = parseLocator(locator)
  const abs = path.isAbsolute(sourcePath)
    ? sourcePath
    : path.resolve(inputDir, sourcePath)
  const real = assertWithinSandbox(inputDir, abs) // throws SandboxError / ENOENT

  const stat = fs.statSync(real)
  if (stat.isDirectory()) {
    return { kind: "unviewable", mime: "inode/directory", path: real, locator: parsed, note: "Source is a directory, not a file." }
  }

  const ext = path.extname(real).toLowerCase()

  // Image → inline data URL (size-capped).
  const imgMime = IMAGE_MIME[ext]
  if (imgMime) {
    if (stat.size > MAX_IMAGE_BYTES) {
      return { kind: "unviewable", mime: imgMime, path: real, locator: parsed, note: `Image too large to preview (${fmtBytes(stat.size)}).` }
    }
    const b64 = fs.readFileSync(real).toString("base64")
    return { kind: "image", dataUrl: `data:${imgMime};base64,${b64}`, mime: imgMime, path: real, locator: parsed }
  }

  // PDF page jump: only the OCR engines leave readable per-page text.
  if (ext === ".pdf") {
    if (parsed?.kind === "page") {
      const pg = readPdfPage(real, parsed.page)
      if (pg) {
        return { kind: "text", text: pg.text, mime: "text/plain", path: real, locator: parsed, page: parsed.page, note: `page ${parsed.page} · ${pg.engine} OCR` }
      }
    }
    return { kind: "unviewable", mime: "application/pdf", path: real, locator: parsed, note: "PDF text preview needs an OCR sidecar — re-run with `readers.pdfEngine: tesseract` (or mistral) to make pages viewable here." }
  }

  // Everything else: read as text, with a binary guard + size cap.
  const buf = readCapped(real, MAX_TEXT_BYTES)
  if (isBinary(buf.bytes)) {
    return { kind: "unviewable", mime: "application/octet-stream", path: real, locator: parsed, note: "Binary file — no text preview." }
  }
  return {
    kind: "text",
    text: buf.bytes.toString("utf-8"),
    mime: "text/plain",
    path: real,
    locator: parsed,
    truncated: buf.truncated || undefined,
    note: buf.truncated ? `truncated to ${fmtBytes(MAX_TEXT_BYTES)}` : undefined,
  }
}

/** Pull one page's text from a PDF's OCR sidecar, tolerating both shapes. */
function readPdfPage(pdfPath: string, page: number): { text: string; engine: string } | null {
  // tesseract: [{ index: <1-based pageNumber>, text }]; locator = p.<index>
  // mistral:   [{ index: <0-based>, markdown }];        locator = p.<index+1>
  const sidecars: Array<{ suffix: string; engine: string; oneBased: boolean }> = [
    { suffix: ".tesseract.json", engine: "tesseract", oneBased: true },
    { suffix: ".mistral.json", engine: "mistral", oneBased: false },
  ]
  for (const { suffix, engine, oneBased } of sidecars) {
    const sidecar = pdfPath + suffix
    if (!fs.existsSync(sidecar)) continue
    try {
      const pages = JSON.parse(fs.readFileSync(sidecar, "utf-8")) as Array<{
        index: number
        text?: string
        markdown?: string
      }>
      const want = oneBased ? page : page - 1
      const hit = pages.find((p) => p.index === want) ?? pages[page - 1]
      const text = hit?.text ?? hit?.markdown
      if (typeof text === "string") return { text, engine }
    } catch {
      // a malformed sidecar falls through to the next / the graceful note
    }
  }
  return null
}

function readCapped(file: string, max: number): { bytes: Buffer; truncated: boolean } {
  const stat = fs.statSync(file)
  if (stat.size <= max) return { bytes: fs.readFileSync(file), truncated: false }
  const fd = fs.openSync(file, "r")
  try {
    const bytes = Buffer.alloc(max)
    fs.readSync(fd, bytes, 0, max, 0)
    return { bytes, truncated: true }
  } finally {
    fs.closeSync(fd)
  }
}

function isBinary(bytes: Buffer): boolean {
  const n = Math.min(bytes.length, BINARY_SNIFF_BYTES)
  for (let i = 0; i < n; i++) if (bytes[i] === 0) return true
  return false
}

import { NextResponse } from "next/server"
import { getRunInputDir } from "@/server/run-registry"
import { loadSource, SandboxError } from "@/server/source-loader"

export const dynamic = "force-dynamic"

/**
 * Read a fact's source for the provenance view, sandboxed to the run's input
 * directory. Query: `path` (the fact's absolute `source`) + optional `locator`.
 * Errors mirror the graph route's discipline: 404 (unknown run / missing file),
 * 403 (path escapes the sandbox — the security boundary), 400 (no path), 500.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { searchParams } = new URL(req.url)
  const sourcePath = searchParams.get("path")
  const locator = searchParams.get("locator") ?? undefined

  if (!sourcePath) {
    return NextResponse.json({ error: "Missing `path` query parameter" }, { status: 400 })
  }

  const inputDir = getRunInputDir(id)
  if (!inputDir) {
    return NextResponse.json(
      { error: "Can't resolve this run's input directory (unknown run, or no input recorded)" },
      { status: 404 }
    )
  }

  try {
    const payload = loadSource(inputDir, sourcePath, locator)
    return NextResponse.json(payload)
  } catch (err) {
    if (err instanceof SandboxError) {
      return NextResponse.json({ error: err.message }, { status: 403 })
    }
    if (isErrno(err) && (err.code === "ENOENT" || err.code === "ENOTDIR")) {
      return NextResponse.json({ error: `Source not found: ${sourcePath}` }, { status: 404 })
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to read source" },
      { status: 500 }
    )
  }
}

function isErrno(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && typeof (err as NodeJS.ErrnoException).code === "string"
}

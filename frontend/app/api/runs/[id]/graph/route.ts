import { existsSync } from "node:fs"
import { NextResponse } from "next/server"
import { getRunOutput } from "@/server/run-registry"
import { loadGraph, UnsupportedFormatError } from "@/server/graph-loader"

export const dynamic = "force-dynamic"

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const output = getRunOutput(id)
  if (!output) {
    return NextResponse.json(
      { error: "No graph for this run (not found, still running, or failed)" },
      { status: 404 }
    )
  }
  if (!existsSync(output)) {
    return NextResponse.json(
      { error: `Graph file is missing: ${output}` },
      { status: 404 }
    )
  }
  try {
    const graph = loadGraph(output)
    return NextResponse.json({ graph, output })
  } catch (err) {
    if (err instanceof UnsupportedFormatError) {
      return NextResponse.json({ error: err.message }, { status: 422 })
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to read graph" },
      { status: 500 }
    )
  }
}

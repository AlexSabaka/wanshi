import { NextResponse } from "next/server"
import { RunRequestSchema } from "@/lib/kg-options"
import { listRuns, startRun } from "@/server/run-registry"

export const dynamic = "force-dynamic"

export async function GET() {
  return NextResponse.json({ runs: listRuns() })
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null)
  const parsed = RunRequestSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid run configuration", details: parsed.error.flatten() },
      { status: 400 }
    )
  }
  const run = startRun(parsed.data)
  return NextResponse.json({ run }, { status: 201 })
}

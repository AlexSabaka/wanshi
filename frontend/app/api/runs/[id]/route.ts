import { NextResponse } from "next/server"
import { getRun } from "@/server/run-registry"

export const dynamic = "force-dynamic"

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const record = getRun(id)
  if (!record) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 })
  }
  return NextResponse.json({ run: record.summary })
}

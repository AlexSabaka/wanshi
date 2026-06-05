import { NextResponse } from "next/server"
import { cancelRun } from "@/server/run-registry"

export const dynamic = "force-dynamic"

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const ok = cancelRun(id)
  return NextResponse.json({ ok }, { status: ok ? 202 : 409 })
}

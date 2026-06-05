import { getRun } from "@/server/run-registry"
import type { LogLine, RunSummary } from "@/types"

export const dynamic = "force-dynamic"

const TERMINAL = ["completed", "failed", "cancelled"]

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const record = getRun(id)
  if (!record) {
    return new Response("Run not found", { status: 404 })
  }

  const encoder = new TextEncoder()

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false
      const send = (event: string, data: unknown) => {
        if (closed) return
        try {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
          )
        } catch {
          // controller already closed
        }
      }

      // Replay current state so a late or reconnecting client is caught up.
      send("summary", record.summary)
      for (const log of record.logs) send("log", log)

      if (TERMINAL.includes(record.summary.state)) {
        send("end", record.summary)
        closed = true
        controller.close()
        return
      }

      const onSummary = (s: RunSummary) => send("summary", s)
      const onLog = (l: LogLine) => send("log", l)
      const onEnd = (s: RunSummary) => {
        send("end", s)
        cleanup()
        closed = true
        try {
          controller.close()
        } catch {
          // already closed
        }
      }
      const cleanup = () => {
        record.bus.off("summary", onSummary)
        record.bus.off("log", onLog)
        record.bus.off("end", onEnd)
      }

      record.bus.on("summary", onSummary)
      record.bus.on("log", onLog)
      record.bus.once("end", onEnd)

      req.signal.addEventListener("abort", () => {
        cleanup()
        closed = true
        try {
          controller.close()
        } catch {
          // already closed
        }
      })
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  })
}

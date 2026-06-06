"use client"

import {
  Bar,
  BarChart,
  Cell,
  LabelList,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts"
import type { TypeCount } from "@/types"
import { colorForType } from "@/lib/graph-colors"

/**
 * Horizontal bar chart of a type distribution (entity or relation types),
 * colored by the shared `colorForType` so colors match the graph view.
 */
export function TypeBarChart({
  data,
  max = 12,
}: {
  data: TypeCount[]
  max?: number
}) {
  const points = data.slice(0, max)
  if (points.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">No data.</p>
    )
  }
  const height = Math.max(120, points.length * 30 + 16)

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart
        data={points}
        layout="vertical"
        margin={{ top: 4, right: 40, left: 8, bottom: 4 }}
      >
        <XAxis type="number" hide />
        <YAxis
          type="category"
          dataKey="type"
          width={120}
          tick={{ fontSize: 12 }}
          tickLine={false}
          axisLine={false}
        />
        <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={22} isAnimationActive={false}>
          {points.map((p) => (
            <Cell key={p.type} fill={colorForType(p.type)} />
          ))}
          <LabelList dataKey="count" position="right" fontSize={11} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

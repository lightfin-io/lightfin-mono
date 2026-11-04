import type { Bar } from '@lightfin/core'
import type { AnnotationInput } from '@lightfin/core/annotations'

/**
 * A stand-in for an AI model answering with the `annotate_chart` tool
 * (`annotateChartTool` from '@lightfin/core/annotations/schema'). A real
 * host sends the model the bars and the tool; this returns the same shaped
 * input from a few lines of swing/trend detection, so the demo runs offline.
 */
export function mockAnalyst(bars: readonly Bar[]): {
  annotations: AnnotationInput[]
} {
  if (bars.length < 2) return { annotations: [] }
  let hi = bars[0]!
  let lo = bars[0]!
  for (const bar of bars) {
    if (bar.high > hi.high) hi = bar
    if (bar.low < lo.low) lo = bar
  }
  const first = bars[0]!
  const last = bars.at(-1)!
  const fit = linearFit(bars.map(b => b.close))
  const start = fit.at(0)
  const end = fit.at(bars.length - 1)
  const change = ((end - start) / start) * 100
  // Retrace the latest swing: from the earlier extreme to the later one.
  const [from, to] =
    lo.time < hi.time
      ? [
          { time: lo.time, price: lo.low },
          { time: hi.time, price: hi.high },
        ]
      : [
          { time: hi.time, price: hi.high },
          { time: lo.time, price: lo.low },
        ]

  return {
    annotations: [
      {
        id: 'resistance',
        type: 'hline',
        points: [{ time: hi.time, price: hi.high }],
        text: 'Resistance',
        style: { color: '#ef5350', lineStyle: 'dashed', lineWidth: 1 },
      },
      {
        id: 'support',
        type: 'hline',
        points: [{ time: lo.time, price: lo.low }],
        text: 'Support',
        style: { color: '#26a69a', lineStyle: 'dashed', lineWidth: 1 },
      },
      {
        id: 'swing-high',
        type: 'marker',
        shape: 'arrowDown',
        points: [{ time: hi.time, price: hi.high }],
        text: 'Swing high',
      },
      {
        id: 'swing-low',
        type: 'marker',
        shape: 'arrowUp',
        points: [{ time: lo.time, price: lo.low }],
        text: 'Swing low',
      },
      {
        id: 'trend',
        type: 'trendline',
        points: [
          { time: first.time, price: start },
          { time: last.time, price: end },
        ],
        text: `Trend ${change >= 0 ? '+' : ''}${change.toFixed(2)}%`,
        style: { color: '#f7a600', lineStyle: 'dotted' },
      },
      { id: 'retracement', type: 'fib', points: [from, to] },
    ],
  }
}

/** Least-squares line through `ys` at x = 0, 1, …; `at(x)` reads it. */
function linearFit(ys: readonly number[]): { at(x: number): number } {
  const n = ys.length
  const meanX = (n - 1) / 2
  const meanY = ys.reduce((a, b) => a + b, 0) / n
  let num = 0
  let den = 0
  ys.forEach((y, x) => {
    num += (x - meanX) * (y - meanY)
    den += (x - meanX) ** 2
  })
  const slope = den === 0 ? 0 : num / den
  return { at: x => meanY + slope * (x - meanX) }
}

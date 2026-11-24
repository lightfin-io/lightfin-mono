import type { ToolSpec } from './draw'
import { HIT_SLOP, fillText, line, stroke } from './draw'
import { distToPolyline, distToSegment } from './geometry'

function pattern(labels: readonly string[], neckline = false): ToolSpec {
  return {
    points: labels.length,
    handles: labels.map((_, i) => [i, i] as const),
    draw(ctx, { px, style }, { previewPoints }) {
      const points =
        previewPoints === undefined ? px : px.slice(0, previewPoints)
      stroke(ctx, style)
      ctx.beginPath()
      ctx.moveTo(points[0]!.x, points[0]!.y)
      for (let i = 1; i < points.length; i++) {
        const { x, y } = points[i]!
        ctx.lineTo(x, y)
      }
      ctx.stroke()

      if (neckline && points.length >= 4) {
        stroke(ctx, { ...style, lineStyle: 'dashed' })
        line(ctx, points[1]!, points[3]!)
      }
      points.forEach((p, i) => {
        const label = labels[i]
        if (!label) return
        const before = points[i - 1] ?? points[i + 1] ?? p
        const after = points[i + 1] ?? before
        const above = p.y <= (before.y + after.y) / 2
        fillText(
          ctx,
          style,
          label,
          {
            x: p.x,
            y: p.y + (above ? -6 : 6),
            align: 'center',
            baseline: above ? 'bottom' : 'top',
          },
          style.textColor,
        )
      })
    },
    hit({ px, style }, p) {
      const slop = HIT_SLOP + style.lineWidth / 2
      return (
        distToPolyline(p, px) <= slop ||
        (neckline && distToSegment(p, px[1]!, px[3]!) <= slop)
      )
    },
    caption: ({ px, style }) => {
      const top = px.reduce((a, p) => (p.y < a.y ? p : a))
      return {
        x: top.x,
        y: top.y - style.fontSize - 9,
        align: 'center',
        baseline: 'bottom',
      }
    },
  }
}

export const PATTERN_TOOLS = {
  elliottImpulse: pattern(['', '1', '2', '3', '4', '5']),
  elliottCorrection: pattern(['', 'A', 'B', 'C']),
  headAndShoulders: pattern(['LS', '', 'H', '', 'RS'], true),
}

import type { DrawEnv, Resolved, ToolSpec } from './draw'
import { arrowHead, fillLabel, fillText, line, stroke, withAlpha } from './draw'
import { inBox } from './geometry'

// A position placed with one click: this wide, its stop this far from the
// entry and its target twice as far (CSS px).
const POSITION_WIDTH = 120
const POSITION_RISK = 40
const ZONE_ALPHA = 0.22

const pct = (from: number, to: number) => {
  const v = ((to - from) / from) * 100
  return `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`
}

/** "3d 4h", "2h 15m", "45m", "30s": the two largest units. */
export function formatDuration(seconds: number): string {
  const s = Math.round(Math.abs(seconds))
  const parts = [
    [Math.floor(s / 86_400), 'd'],
    [Math.floor((s % 86_400) / 3600), 'h'],
    [Math.floor((s % 3600) / 60), 'm'],
    [s % 60, 's'],
  ] as const
  const first = parts.findIndex(([n]) => n > 0)
  if (first === -1) return '0s'
  return parts
    .slice(first, first + 2)
    .filter(([n]) => n > 0)
    .map(([n, unit]) => `${n}${unit}`)
    .join(' ')
}

/** Entry (left edge), target (right edge), stop: the box's x span and the three ys. */
function positionBox({ px: [e, t, s] }: Resolved) {
  return {
    left: Math.min(e!.x, t!.x),
    right: Math.max(e!.x, t!.x),
    entry: e!.y,
    target: t!.y,
    stop: s!.y,
  }
}

function position(side: 1 | -1): ToolSpec {
  return {
    points: 3,
    place: (at, { barWidth }) => {
      const w = Math.max(POSITION_WIDTH, barWidth * 10)
      return [
        at,
        { x: at.x + w, y: at.y - side * POSITION_RISK * 2 },
        { x: at.x, y: at.y + side * POSITION_RISK },
      ]
    },
    // Entry on the left edge; target and stop on the right, where the
    // width is set too.
    handles: [
      [0, 0],
      [1, 1],
      [1, 2],
    ],
    draw(ctx, r, env: DrawEnv) {
      const { theme, formatPrice } = env
      const { style } = r
      const { left, right, entry, target, stop } = positionBox(r)
      const [pe, pt, ps] = r.ann.points.map(p => p.price) as [
        number,
        number,
        number,
      ]
      const w = right - left
      ctx.save()
      ctx.globalAlpha = ZONE_ALPHA
      ctx.fillStyle = theme.upColor
      ctx.fillRect(left, Math.min(entry, target), w, Math.abs(target - entry))
      ctx.fillStyle = theme.downColor
      ctx.fillRect(left, Math.min(entry, stop), w, Math.abs(stop - entry))
      ctx.restore()
      stroke(ctx, style)
      line(ctx, { x: left, y: entry }, { x: right, y: entry })

      const cx = (left + right) / 2
      const pad = 4
      const label = (text: string, y: number, color: string, away: boolean) =>
        fillLabel(
          ctx,
          r,
          text,
          {
            x: cx,
            y: away ? y - pad - 1 : y + pad + 1,
            align: 'center',
            baseline: away ? 'bottom' : 'top',
          },
          { color, pad },
          '#ffffff',
        )
      const risk = Math.abs(pe - ps)
      const ratio = risk === 0 ? '—' : (Math.abs(pt - pe) / risk).toFixed(2)
      // Each label just outside its zone's far edge.
      label(
        `Stop ${formatPrice(ps)} (${pct(pe, ps)})`,
        stop,
        theme.downColor,
        stop < entry,
      )
      label(
        `Target ${formatPrice(pt)} (${pct(pe, pt)})`,
        target,
        theme.upColor,
        target < entry,
      )
      fillText(
        ctx,
        style,
        `Risk/reward ${ratio}`,
        {
          x: cx,
          y: entry + (target < entry ? 3 : -3),
          align: 'center',
          baseline: target < entry ? 'top' : 'bottom',
        },
        style.color,
      )
    },
    hit(r, p) {
      const { left, right, entry, target, stop } = positionBox(r)
      const top = Math.min(entry, target, stop)
      const bottom = Math.max(entry, target, stop)
      return inBox(p, { x: left, y: top }, { x: right, y: bottom }, 2)
    },
  }
}

export const MEASURE_TOOLS = {
  longPosition: position(1),
  shortPosition: position(-1),

  measure: {
    points: 2,
    handles: [
      [0, 0],
      [1, 1],
    ],
    draw(ctx, r, { theme, barWidth, formatPrice }) {
      const [a, b] = r.px
      const [p0, p1] = r.ann.points
      const up = p1!.price >= p0!.price
      const color = r.ann.style.color ?? (up ? r.style.color : theme.downColor)
      const style = { ...r.style, color, lineStyle: 'solid' as const }
      const left = Math.min(a!.x, b!.x)
      const right = Math.max(a!.x, b!.x)
      const top = Math.min(a!.y, b!.y)
      const bottom = Math.max(a!.y, b!.y)
      ctx.save()
      ctx.globalAlpha = r.style.fillAlpha
      ctx.fillStyle = r.ann.style.fillColor ?? color
      ctx.fillRect(left, top, right - left, bottom - top)
      ctx.restore()

      const cx = (a!.x + b!.x) / 2
      const cy = (a!.y + b!.y) / 2
      stroke(ctx, style)
      line(ctx, { x: cx, y: a!.y }, { x: cx, y: b!.y })
      line(ctx, { x: a!.x, y: cy }, { x: b!.x, y: cy })
      if (Math.abs(b!.y - a!.y) > 12) {
        arrowHead(ctx, { x: cx, y: a!.y }, { x: cx, y: b!.y }, style)
      }
      if (Math.abs(b!.x - a!.x) > 12) {
        arrowHead(ctx, { x: a!.x, y: cy }, { x: b!.x, y: cy }, style)
      }

      const change = p1!.price - p0!.price
      const bars = Math.round((b!.x - a!.x) / barWidth)
      const text =
        `${change >= 0 ? '+' : '−'}${formatPrice(Math.abs(change))} (${pct(p0!.price, p1!.price)})\n` +
        `${bars} bar${Math.abs(bars) === 1 ? '' : 's'}, ${formatDuration(p1!.time - p0!.time)}`
      // Beyond the end the measure runs to: above when up, below when down.
      fillLabel(
        ctx,
        r,
        text,
        {
          x: cx,
          y: up ? top - 10 : bottom + 10,
          align: 'center',
          baseline: up ? 'bottom' : 'top',
        },
        { color: withAlpha(color, 0.9), pad: 6 },
      )
    },
    hit: ({ px: [a, b] }, p) => inBox(p, a!, b!, 2),
  },
} satisfies Record<string, ToolSpec>

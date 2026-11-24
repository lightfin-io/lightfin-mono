import type { ToolSpec } from './draw'
import { HIT_SLOP, fillText, stroke } from './draw'
import type { Px } from './geometry'
import { inBox } from './geometry'

// Time × price. Lead with 1×1 so it keeps its label where rays converge.
const RATIOS = [
  [1, 1],
  [1, 2],
  [1, 3],
  [1, 4],
  [1, 8],
  [2, 1],
  [3, 1],
  [4, 1],
  [8, 1],
] as const

function rays(origin: Px, anchor: Px) {
  const dx = anchor.x - origin.x
  const dy = anchor.y - origin.y
  const ratios = dx && dy ? RATIOS : [RATIOS[0]]
  return ratios.map(([time, price]) => ({
    label: `${time}×${price}`,
    x: dx * time,
    y: dy * price,
  }))
}

/** Where a ray leaves the plot. */
function exit(origin: Px, ray: Px, min: Px, max: Px): Px | null {
  const tx = ray.x ? ((ray.x > 0 ? max.x : min.x) - origin.x) / ray.x : Infinity
  const ty = ray.y ? ((ray.y > 0 ? max.y : min.y) - origin.y) / ray.y : Infinity
  const t = Math.min(tx, ty)
  if (!Number.isFinite(t) || t <= 0) return null
  const point = { x: origin.x + t * ray.x, y: origin.y + t * ray.y }
  return inBox(point, min, max, 1e-6) ? point : null
}

function distanceToRay(p: Px, origin: Px, ray: Px): number {
  const x = p.x - origin.x
  const y = p.y - origin.y
  const length = Math.hypot(ray.x, ray.y)
  if (!length || x * ray.x + y * ray.y <= 0) return Math.hypot(x, y)
  return Math.abs(x * (ray.y / length) - y * (ray.x / length))
}

export const GANN_FAN: ToolSpec = {
  points: 2,
  handles: [
    [0, 0],
    [1, 1],
  ],
  draw(ctx, { px: [a, b], style }, { pane }) {
    const min = { x: pane.left, y: pane.top }
    const max = { x: pane.left + pane.width, y: pane.top + pane.height }
    const labels: { text: string; x: number; y: number }[] = []
    const labelInset = style.fontSize * 1.25
    stroke(ctx, style)
    ctx.beginPath()
    for (const ray of rays(a!, b!)) {
      const end = exit(a!, ray, min, max)
      if (!end) continue
      ctx.moveTo(a!.x, a!.y)
      ctx.lineTo(end.x, end.y)
      const x = Math.max(min.x + labelInset, Math.min(max.x - labelInset, end.x))
      const y = Math.max(min.y + style.fontSize + 2, end.y - 3)
      if (
        labels.some(
          p =>
            Math.abs(p.x - x) < labelInset * 2 &&
            Math.abs(p.y - y) < style.fontSize + 2,
        )
      )
        continue
      labels.push({ text: ray.label, x, y })
    }
    ctx.stroke()
    for (const { text, x, y } of labels) {
      fillText(
        ctx,
        style,
        text,
        { x, y, align: 'center', baseline: 'bottom' },
        style.textColor,
      )
    }
  },
  hit: ({ px: [a, b], style }, p) =>
    rays(a!, b!).some(
      ray => distanceToRay(p, a!, ray) <= HIT_SLOP + style.lineWidth / 2,
    ),
  caption: ({ px: [a] }) => ({
    x: a!.x,
    y: a!.y - 4,
    align: 'center',
    baseline: 'bottom',
  }),
}

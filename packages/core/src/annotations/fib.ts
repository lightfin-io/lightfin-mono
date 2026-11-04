import type { DrawEnv, Resolved, ToolSpec } from './draw'
import { HIT_SLOP, fillText, line, stroke } from './draw'
import type { Px } from './geometry'
import { crisp, distToPolyline } from './geometry'

export const FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1] as const
export const FIB_EXTENSION_LEVELS = [
  0, 0.236, 0.382, 0.5, 0.618, 0.786, 1, 1.272, 1.618, 2, 2.618,
] as const
const FIB_COLORS = [
  '#787b86',
  '#f23645',
  '#ff9800',
  '#4caf50',
  '#089981',
  '#00bcd4',
  '#787b86',
  '#2962ff',
  '#e91e63',
  '#9c27b0',
  '#673ab7',
]

interface Levels {
  levels: readonly number[]
  /** Y (CSS px) and price of a level. */
  y(level: number): number
  price(level: number): number
  left: number
  right: number
}

/** Shaded bands between levels, then each level's line and label. */
function drawLevels(
  ctx: CanvasRenderingContext2D,
  { ann, style }: Resolved,
  { dpr, formatPrice }: DrawEnv,
  { levels, y, price, left, right }: Levels,
): void {
  const color = (i: number) =>
    ann.style.color ?? FIB_COLORS[i % FIB_COLORS.length]!
  const ys = levels.map(y)
  ctx.save()
  ctx.globalAlpha = 0.08
  for (let i = 1; i < ys.length; i++) {
    ctx.fillStyle = color(i)
    ctx.fillRect(left, ys[i - 1]!, right - left, ys[i]! - ys[i - 1]!)
  }
  ctx.restore()
  levels.forEach((level, i) => {
    const ly = crisp(ys[i]!, style.lineWidth, dpr)
    stroke(ctx, { ...style, color: color(i) })
    line(ctx, { x: left, y: ly }, { x: right, y: ly })
    fillText(
      ctx,
      style,
      `${level} (${formatPrice(price(level))})`,
      { x: left + 4, y: ly - 2, align: 'left', baseline: 'bottom' },
      color(i),
    )
  })
}

function hitLevels(
  p: Px,
  { levels, y, left, right }: Omit<Levels, 'price'>,
): boolean {
  if (p.x < left - HIT_SLOP || p.x > right + HIT_SLOP) return false
  return levels.some(level => Math.abs(p.y - y(level)) <= HIT_SLOP)
}

/**
 * Retracement levels: 0 at the second point, 1 at the first (prices and y
 * are linearly related, so this holds in pixels too).
 */
function retracement({ ann, px: [a, b] }: Resolved): Levels {
  const p0 = ann.points[0]!.price
  const p1 = ann.points[1]!.price
  return {
    levels: FIB_LEVELS,
    y: level => b!.y + (a!.y - b!.y) * level,
    price: level => p1 + (p0 - p1) * level,
    left: Math.min(a!.x, b!.x),
    right: Math.max(a!.x, b!.x),
  }
}

/** Extension levels: the first-to-second move, scaled and laid off from the third point. */
function extension({ ann, px: [a, b, c] }: Resolved): Levels {
  const [p0, p1, p2] = ann.points.map(p => p.price)
  return {
    levels: FIB_EXTENSION_LEVELS,
    y: level => c!.y + (b!.y - a!.y) * level,
    price: level => p2! + (p1! - p0!) * level,
    left: c!.x,
    right: c!.x + Math.max(Math.abs(b!.x - a!.x), 60),
  }
}

export const FIB_TOOLS = {
  fib: {
    points: 2,
    handles: [
      [0, 0],
      [1, 1],
    ],
    draw(ctx, r, env) {
      const [a, b] = r.px
      // The dashed diagonal from the first point to the second.
      stroke(ctx, {
        ...r.style,
        lineStyle: 'dashed',
        color: r.ann.style.color ?? FIB_COLORS[0]!,
      })
      line(ctx, a!, b!)
      drawLevels(ctx, r, env, retracement(r))
    },
    hit: (r, p) =>
      distToPolyline(p, r.px) <= HIT_SLOP || hitLevels(p, retracement(r)),
    caption: ({ px: [a, b] }) => ({
      x: Math.max(a!.x, b!.x) - 4,
      y: Math.min(a!.y, b!.y) - 3,
      align: 'right',
      baseline: 'bottom',
    }),
  },

  fibExtension: {
    points: 3,
    handles: [
      [0, 0],
      [1, 1],
      [2, 2],
    ],
    draw(ctx, r, env) {
      const [a, b, c] = r.px
      stroke(ctx, {
        ...r.style,
        lineStyle: 'dashed',
        color: r.ann.style.color ?? FIB_COLORS[0]!,
      })
      line(ctx, a!, b!)
      line(ctx, b!, c!)
      drawLevels(ctx, r, env, extension(r))
    },
    hit: (r, p) =>
      distToPolyline(p, r.px) <= HIT_SLOP || hitLevels(p, extension(r)),
    caption: r => {
      const { y, right, levels } = extension(r)
      const top = Math.min(...levels.map(y))
      return { x: right - 4, y: top - 3, align: 'right', baseline: 'bottom' }
    },
  },
} satisfies Record<string, ToolSpec>

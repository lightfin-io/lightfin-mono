import type { PlotRect } from '../chart/chart'
import type { ChartTheme } from '../chart/options'
import type { Px } from './geometry'
import { crisp, distToSegment, inBox } from './geometry'
import type { Annotation, AnnotationType, LineStyle } from './types'

/** How far (CSS px) from a drawing a press still grabs it. */
export const HIT_SLOP = 6

export const FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1] as const
const FIB_COLORS = [
  '#787b86',
  '#f23645',
  '#ff9800',
  '#4caf50',
  '#089981',
  '#00bcd4',
  '#787b86',
]

export interface DrawEnv {
  pane: PlotRect
  dpr: number
  theme: ChartTheme
  formatPrice(price: number): string
}

export interface ResolvedStyle {
  color: string
  lineWidth: number
  lineStyle: LineStyle
  fontSize: number
}

/** An annotation mapped to the screen: `px[i]` is `points[i]` in CSS px. */
export interface Resolved {
  ann: Annotation
  px: Px[]
  style: ResolvedStyle
}

interface ToolSpec {
  /** Points the user places: one click, or two (a drag, or two clicks). */
  points: 1 | 2
  /**
   * Drag handles, each `[a, b]`: it sits at point `a`'s time and point `b`'s
   * price, and dragging it sets exactly those two.
   */
  handles: readonly (readonly [number, number])[]
  draw(ctx: CanvasRenderingContext2D, r: Resolved, env: DrawEnv): void
  hit(r: Resolved, p: Px): boolean
}

// Text extents from the last paint, for hit-testing without a canvas.
const textBoxes = new WeakMap<Annotation, { a: Px; b: Px }>()

export const TOOLS: Record<AnnotationType, ToolSpec> = {
  trendline: {
    points: 2,
    handles: [
      [0, 0],
      [1, 1],
    ],
    draw(ctx, { px: [a, b], style }) {
      stroke(ctx, style)
      ctx.beginPath()
      ctx.moveTo(a!.x, a!.y)
      ctx.lineTo(b!.x, b!.y)
      ctx.stroke()
    },
    hit: ({ px: [a, b] }, p) => distToSegment(p, a!, b!) <= HIT_SLOP,
  },

  hline: {
    points: 1,
    handles: [[0, 0]],
    draw(ctx, { px: [a], style }, { pane, dpr }) {
      const y = crisp(a!.y, style.lineWidth, dpr)
      stroke(ctx, style)
      ctx.beginPath()
      ctx.moveTo(pane.left, y)
      ctx.lineTo(pane.left + pane.width, y)
      ctx.stroke()
    },
    hit: ({ px: [a] }, p) => Math.abs(p.y - a!.y) <= HIT_SLOP,
  },

  vline: {
    points: 1,
    handles: [[0, 0]],
    draw(ctx, { px: [a], style }, { pane, dpr }) {
      const x = crisp(a!.x, style.lineWidth, dpr)
      stroke(ctx, style)
      ctx.beginPath()
      ctx.moveTo(x, pane.top)
      ctx.lineTo(x, pane.top + pane.height)
      ctx.stroke()
    },
    hit: ({ px: [a] }, p) => Math.abs(p.x - a!.x) <= HIT_SLOP,
  },

  rectangle: {
    points: 2,
    handles: [
      [0, 0],
      [1, 1],
      [0, 1],
      [1, 0],
    ],
    draw(ctx, { ann, px: [a, b], style }, { dpr }) {
      const w = style.lineWidth
      const x0 = crisp(Math.min(a!.x, b!.x), w, dpr)
      const x1 = crisp(Math.max(a!.x, b!.x), w, dpr)
      const y0 = crisp(Math.min(a!.y, b!.y), w, dpr)
      const y1 = crisp(Math.max(a!.y, b!.y), w, dpr)
      ctx.save()
      if (ann.style.fillColor) ctx.fillStyle = ann.style.fillColor
      else {
        ctx.fillStyle = style.color
        ctx.globalAlpha = 0.15
      }
      ctx.fillRect(x0, y0, x1 - x0, y1 - y0)
      ctx.restore()
      stroke(ctx, style)
      ctx.strokeRect(x0, y0, x1 - x0, y1 - y0)
    },
    hit: ({ px: [a, b] }, p) => inBox(p, a!, b!, HIT_SLOP),
  },

  fib: {
    points: 2,
    handles: [
      [0, 0],
      [1, 1],
    ],
    draw(ctx, { ann, px: [a, b], style }, { dpr, theme, formatPrice }) {
      const left = Math.min(a!.x, b!.x)
      const right = Math.max(a!.x, b!.x)
      const p0 = ann.points[0]!.price
      const p1 = ann.points[1]!.price
      const color = (i: number) => ann.style.color ?? FIB_COLORS[i]!
      const ys = FIB_LEVELS.map(level => fibY(a!, b!, level))

      ctx.save()
      ctx.globalAlpha = 0.08
      for (let i = 1; i < ys.length; i++) {
        ctx.fillStyle = color(i)
        ctx.fillRect(left, ys[i - 1]!, right - left, ys[i]! - ys[i - 1]!)
      }
      ctx.restore()

      // The dashed diagonal from the first point to the second.
      stroke(ctx, { ...style, lineStyle: 'dashed', color: color(0) })
      ctx.beginPath()
      ctx.moveTo(a!.x, a!.y)
      ctx.lineTo(b!.x, b!.y)
      ctx.stroke()

      ctx.font = `${theme.fontSize}px ${theme.fontFamily}`
      ctx.textAlign = 'left'
      ctx.textBaseline = 'bottom'
      FIB_LEVELS.forEach((level, i) => {
        const y = crisp(ys[i]!, style.lineWidth, dpr)
        stroke(ctx, { ...style, color: color(i) })
        ctx.beginPath()
        ctx.moveTo(left, y)
        ctx.lineTo(right, y)
        ctx.stroke()
        ctx.fillStyle = color(i)
        const price = p1 + (p0 - p1) * level
        ctx.fillText(`${level} (${formatPrice(price)})`, left + 4, y - 2)
      })
    },
    hit({ px: [a, b] }, p) {
      if (distToSegment(p, a!, b!) <= HIT_SLOP) return true
      const left = Math.min(a!.x, b!.x)
      const right = Math.max(a!.x, b!.x)
      if (p.x < left - HIT_SLOP || p.x > right + HIT_SLOP) return false
      return FIB_LEVELS.some(
        level => Math.abs(p.y - fibY(a!, b!, level)) <= HIT_SLOP,
      )
    },
  },

  text: {
    points: 1,
    handles: [],
    draw(ctx, { ann, px: [a], style }, { theme }) {
      if (!ann.text) return
      const size = style.fontSize
      ctx.font = `${size}px ${theme.fontFamily}`
      ctx.textAlign = 'left'
      ctx.textBaseline = 'middle'
      ctx.fillStyle = style.color
      ctx.fillText(ann.text, a!.x, a!.y)
      const w = ctx.measureText(ann.text).width
      textBoxes.set(ann, {
        a: { x: a!.x, y: a!.y - size * 0.7 },
        b: { x: a!.x + w, y: a!.y + size * 0.7 },
      })
    },
    hit({ ann }, p) {
      const box = textBoxes.get(ann)
      return !!box && inBox(p, box.a, box.b, 2)
    },
  },
}

/** The last-painted box around a text annotation, if any. */
export function textBox(ann: Annotation): { a: Px; b: Px } | undefined {
  return textBoxes.get(ann)
}

/**
 * Y of a fib level: 0 at the second point, 1 at the first (prices and y are
 * linearly related, so this holds in pixels too).
 */
function fibY(a: Px, b: Px, level: number): number {
  return b.y + (a.y - b.y) * level
}

export function resolveStyle(
  ann: Annotation,
  theme: ChartTheme,
): ResolvedStyle {
  const { style, type } = ann
  return {
    color:
      style.color ?? (type === 'text' ? theme.axisTextColor : theme.lineColor),
    lineWidth:
      style.lineWidth ?? (type === 'rectangle' || type === 'fib' ? 1 : 2),
    lineStyle: style.lineStyle ?? 'solid',
    fontSize: style.fontSize ?? 14,
  }
}

function stroke(ctx: CanvasRenderingContext2D, style: ResolvedStyle): void {
  const w = style.lineWidth
  ctx.strokeStyle = style.color
  ctx.lineWidth = w
  ctx.setLineDash(
    style.lineStyle === 'dashed'
      ? [6 * Math.max(1, w / 2), 4 * Math.max(1, w / 2)]
      : style.lineStyle === 'dotted'
        ? [w, 2 * w]
        : [],
  )
}

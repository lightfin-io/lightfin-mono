import type { PlotRect } from '../chart/chart'
import type { ChartTheme } from '../chart/options'
import type { Px } from './geometry'
import { crisp, distToSegment, inBox } from './geometry'
import type { Annotation, AnnotationType, LineStyle } from './types'

/** How far (CSS px) from a drawing a press still grabs it. */
export const HIT_SLOP = 6

// Marker geometry, CSS px: an arrow's tip sits GAP off its point, then a
// HEAD-tall head and a SHAFT-long stem.
const MARKER_GAP = 4
const MARKER_HEAD = 8
const MARKER_HALF = 6
const MARKER_SHAFT = 8
const MARKER_STEM = 2
const MARKER_RADIUS = 5

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

/** Where a label is drawn: its anchor and how the text sits around it. */
interface LabelAnchor {
  x: number
  y: number
  align: 'left' | 'center' | 'right'
  baseline: 'top' | 'middle' | 'bottom'
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
  /** Where the drawing's `text` goes as a caption (types that draw it themselves omit this). */
  caption?(r: Resolved, env: DrawEnv): LabelAnchor
}

// Label extents from the last paint, for hit-testing without a canvas.
const labelBoxes = new WeakMap<Annotation, { a: Px; b: Px }>()

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
    caption: ({ px: [a, b], style }) => ({
      x: (a!.x + b!.x) / 2,
      y: (a!.y + b!.y) / 2 - style.lineWidth - 3,
      align: 'center',
      baseline: 'bottom',
    }),
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
    caption: ({ px: [a], style }, { pane }) => ({
      x: pane.left + pane.width - 4,
      y: a!.y - style.lineWidth - 2,
      align: 'right',
      baseline: 'bottom',
    }),
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
    // At the bottom, clear of the legend in the top-left.
    caption: ({ px: [a], style }, { pane }) => ({
      x: a!.x + style.lineWidth + 3,
      y: pane.top + pane.height - 4,
      align: 'left',
      baseline: 'bottom',
    }),
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
    caption: ({ px: [a, b] }) => ({
      x: Math.min(a!.x, b!.x) + 4,
      y: Math.min(a!.y, b!.y) + 4,
      align: 'left',
      baseline: 'top',
    }),
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
    caption: ({ px: [a, b] }) => ({
      x: Math.max(a!.x, b!.x) - 4,
      y: Math.min(a!.y, b!.y) - 3,
      align: 'right',
      baseline: 'bottom',
    }),
  },

  text: {
    points: 1,
    handles: [],
    draw(ctx, r, { theme }) {
      if (!r.ann.text) return
      const [a] = r.px
      fillLabel(
        ctx,
        r,
        r.ann.text,
        { ...a!, align: 'left', baseline: 'middle' },
        theme,
      )
    },
    hit: () => false,
  },

  marker: {
    points: 1,
    handles: [[0, 0]],
    draw(ctx, { ann, px: [a], style }) {
      const { x, y } = a!
      ctx.fillStyle = style.color
      ctx.beginPath()
      if (!ann.shape || ann.shape === 'circle') {
        ctx.arc(x, y, MARKER_RADIUS, 0, Math.PI * 2)
      } else {
        // +1: below the point, pointing up at it; -1: above, pointing down.
        const dir = ann.shape === 'arrowUp' ? 1 : -1
        const tip = y + dir * MARKER_GAP
        const base = tip + dir * MARKER_HEAD
        const end = base + dir * MARKER_SHAFT
        ctx.moveTo(x, tip)
        ctx.lineTo(x + MARKER_HALF, base)
        ctx.lineTo(x + MARKER_STEM, base)
        ctx.lineTo(x + MARKER_STEM, end)
        ctx.lineTo(x - MARKER_STEM, end)
        ctx.lineTo(x - MARKER_STEM, base)
        ctx.lineTo(x - MARKER_HALF, base)
        ctx.closePath()
      }
      ctx.fill()
    },
    hit(r, p) {
      const box = markerBox(r)
      return inBox(p, box.a, box.b, HIT_SLOP / 2)
    },
    caption(r) {
      const box = markerBox(r)
      const x = r.px[0]!.x
      return r.ann.shape === 'arrowUp'
        ? { x, y: box.b.y + 3, align: 'center', baseline: 'top' }
        : { x, y: box.a.y - 3, align: 'center', baseline: 'bottom' }
    },
  },
}

/** A marker's shape extent. */
function markerBox({ ann, px: [a] }: Resolved): { a: Px; b: Px } {
  const { x, y } = a!
  if (!ann.shape || ann.shape === 'circle') {
    const r = MARKER_RADIUS
    return { a: { x: x - r, y: y - r }, b: { x: x + r, y: y + r } }
  }
  const dir = ann.shape === 'arrowUp' ? 1 : -1
  const near = y + dir * MARKER_GAP
  const far = near + dir * (MARKER_HEAD + MARKER_SHAFT)
  return {
    a: { x: x - MARKER_HALF, y: Math.min(near, far) },
    b: { x: x + MARKER_HALF, y: Math.max(near, far) },
  }
}

/** Paint a drawing and its caption. */
export function drawAnnotation(
  ctx: CanvasRenderingContext2D,
  r: Resolved,
  env: DrawEnv,
): void {
  const spec = TOOLS[r.ann.type]
  labelBoxes.delete(r.ann)
  spec.draw(ctx, r, env)
  if (r.ann.text && spec.caption) {
    fillLabel(ctx, r, r.ann.text, spec.caption(r, env), env.theme)
  }
}

/** Whether `p` grabs a drawing: its shape, or its label as last painted. */
export function hitAnnotation(r: Resolved, p: Px): boolean {
  if (TOOLS[r.ann.type].hit(r, p)) return true
  const box = labelBoxes.get(r.ann)
  return !!box && inBox(p, box.a, box.b, 2)
}

/** The last-painted box around a drawing's label, if any. */
export function labelBox(ann: Annotation): { a: Px; b: Px } | undefined {
  return labelBoxes.get(ann)
}

/** Fill a line of text in the drawing's color and size, recording its box for hit-testing. */
function fillLabel(
  ctx: CanvasRenderingContext2D,
  { ann, style }: Resolved,
  text: string,
  at: LabelAnchor,
  theme: ChartTheme,
): void {
  const size = style.fontSize
  ctx.setLineDash([])
  ctx.font = `${size}px ${theme.fontFamily}`
  ctx.textAlign = at.align
  ctx.textBaseline = at.baseline
  ctx.fillStyle = style.color
  ctx.fillText(text, at.x, at.y)
  const w = ctx.measureText(text).width
  const h = size * 1.4
  const left =
    at.align === 'left' ? at.x : at.align === 'center' ? at.x - w / 2 : at.x - w
  const top =
    at.baseline === 'top'
      ? at.y
      : at.baseline === 'middle'
        ? at.y - h / 2
        : at.y - h
  labelBoxes.set(ann, {
    a: { x: left, y: top },
    b: { x: left + w, y: top + h },
  })
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
    color: style.color ?? defaultColor(ann, theme),
    lineWidth:
      style.lineWidth ?? (type === 'rectangle' || type === 'fib' ? 1 : 2),
    lineStyle: style.lineStyle ?? 'solid',
    fontSize: style.fontSize ?? (type === 'text' ? 14 : theme.fontSize),
  }
}

function defaultColor(ann: Annotation, theme: ChartTheme): string {
  if (ann.type === 'text') return theme.axisTextColor
  if (ann.shape === 'arrowUp') return theme.upColor
  if (ann.shape === 'arrowDown') return theme.downColor
  return theme.lineColor
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

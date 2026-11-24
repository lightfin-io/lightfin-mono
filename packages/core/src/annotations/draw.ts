import type { PlotRect } from '../chart/chart'
import type { ChartTheme } from '../chart/options'
import type { Px } from './geometry'
import type {
  Annotation,
  AnnotationStyle,
  AnnotationType,
  LineEnds,
  LineStyle,
} from './types'

/** How far (CSS px) from a drawing a press still grabs it. */
export const HIT_SLOP = 6

export interface DrawEnv {
  pane: PlotRect
  dpr: number
  theme: ChartTheme
  /** Pixels per bar slot. */
  barWidth: number
  /** While placing a multi-point drawing, the fixed anchors plus the moving point. */
  previewPoints?: number
  formatPrice(price: number): string
}

export interface ResolvedStyle {
  color: string
  lineWidth: number
  lineStyle: LineStyle
  fontSize: number
  /** CSS font shorthand for the drawing's text. */
  font: string
  textColor: string
  /** Fill color, or null for none; painted at {@link fillAlpha}. */
  fill: string | null
  fillAlpha: number
  extend: LineEnds
  arrow: LineEnds
}

/** An annotation mapped to the screen: `px[i]` is `points[i]` in CSS px. */
export interface Resolved {
  ann: Annotation
  px: Px[]
  style: ResolvedStyle
  /** A regression's fitted line and its band's half-height (CSS px); null without enough bars. */
  fit?: { a: Px; b: Px; band: number } | null
}

/** Where a label is drawn: its anchor and how the text sits around it. */
export interface LabelAnchor {
  x: number
  y: number
  align: 'left' | 'center' | 'right'
  baseline: 'top' | 'middle' | 'bottom'
}

export interface ToolSpec {
  /**
   * Points the user places, in order: one click each, except that dragging
   * from the first press places the second. Freehand tools take this many
   * or more, recorded along a drag.
   */
  points: number
  freehand?: true
  /**
   * Place every point from one click (CSS px), e.g. a position's default
   * target and stop.
   */
  place?(at: Px, env: { barWidth: number }): Px[]
  /**
   * Drag handles, each `[a, b]`: it sits at point `a`'s time and point `b`'s
   * price, and dragging it sets exactly those two.
   */
  handles: readonly (readonly [number, number])[]
  /** Where handle `i` is drawn, when not at its points (see {@link handles}). */
  handleAt?(r: Resolved, i: number): Px
  draw(ctx: CanvasRenderingContext2D, r: Resolved, env: DrawEnv): void
  hit(r: Resolved, p: Px): boolean
  /** Where the drawing's `text` goes as a caption (types that draw it themselves omit this). */
  caption?(r: Resolved, env: DrawEnv): LabelAnchor
  /** Show the price on the price axis, like a horizontal line. */
  badge?: true
  /** The drawing is its text: edit it on placement and double-click. */
  editsText?: true
}

// Label extents from the last paint, for hit-testing without a canvas.
const labelBoxes = new WeakMap<Annotation, { a: Px; b: Px }>()

/** The last-painted box around a drawing's label, if any. */
export function labelBox(ann: Annotation): { a: Px; b: Px } | undefined {
  return labelBoxes.get(ann)
}

export function clearLabelBox(ann: Annotation): void {
  labelBoxes.delete(ann)
}

const LINE_HEIGHT = 1.3

/**
 * Fill a (multi-line) label in the drawing's font and text color, on an
 * optional background box `pad` px larger all round, and record the box for
 * hit-testing. Returns the box.
 */
export function fillLabel(
  ctx: CanvasRenderingContext2D,
  { ann, style }: Resolved,
  text: string,
  at: LabelAnchor,
  background?: { color: string; alpha?: number; pad: number },
  color = style.textColor,
): { a: Px; b: Px } {
  const lines = text.split('\n')
  const lh = style.fontSize * LINE_HEIGHT
  ctx.setLineDash([])
  ctx.font = style.font
  const w = Math.max(...lines.map(l => ctx.measureText(l).width))
  const h = lh * lines.length
  const pad = background?.pad ?? 0
  const left =
    at.align === 'left' ? at.x : at.align === 'center' ? at.x - w / 2 : at.x - w
  const top =
    at.baseline === 'top'
      ? at.y
      : at.baseline === 'middle'
        ? at.y - h / 2
        : at.y - h
  const box = {
    a: { x: left - pad, y: top - pad },
    b: { x: left + w + pad, y: top + h + pad },
  }
  if (background) {
    ctx.save()
    ctx.globalAlpha = background.alpha ?? 1
    ctx.fillStyle = background.color
    ctx.beginPath()
    ctx.roundRect(box.a.x, box.a.y, box.b.x - box.a.x, box.b.y - box.a.y, 3)
    ctx.fill()
    ctx.restore()
  }
  ctx.fillStyle = color
  ctx.textAlign = at.align
  ctx.textBaseline = 'middle'
  const x = at.align === 'left' ? left : at.align === 'center' ? at.x : left + w
  lines.forEach((line, i) => ctx.fillText(line, x, top + lh * (i + 0.5)))
  labelBoxes.set(ann, box)
  return box
}

/** One line of text at `at`, in the drawing's font (no hit box). */
export function fillText(
  ctx: CanvasRenderingContext2D,
  style: ResolvedStyle,
  text: string,
  at: LabelAnchor,
  color: string,
): void {
  ctx.font = style.font
  ctx.textAlign = at.align
  ctx.textBaseline = at.baseline
  ctx.fillStyle = color
  ctx.fillText(text, at.x, at.y)
}

export function stroke(
  ctx: CanvasRenderingContext2D,
  style: Pick<ResolvedStyle, 'color' | 'lineWidth' | 'lineStyle'>,
): void {
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

export function line(ctx: CanvasRenderingContext2D, a: Px, b: Px): void {
  ctx.beginPath()
  ctx.moveTo(a.x, a.y)
  ctx.lineTo(b.x, b.y)
  ctx.stroke()
}

/** Fill a closed polygon with the drawing's fill, if it has one. */
export function fillPolygon(
  ctx: CanvasRenderingContext2D,
  style: ResolvedStyle,
  pts: readonly Px[],
  alpha = 1,
): void {
  if (!style.fill) return
  ctx.save()
  ctx.globalAlpha = style.fillAlpha * alpha
  ctx.fillStyle = style.fill
  ctx.beginPath()
  pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)))
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}

/** Length of an arrowhead for a line `w` px wide. */
export const arrowLength = (w: number): number => 6 + w * 2.5

/** A filled arrowhead with its tip at `to`, pointing away from `from`. */
export function arrowHead(
  ctx: CanvasRenderingContext2D,
  from: Px,
  to: Px,
  style: Pick<ResolvedStyle, 'color' | 'lineWidth'>,
): void {
  const d = Math.hypot(to.x - from.x, to.y - from.y)
  if (d === 0) return
  const len = arrowLength(style.lineWidth)
  const half = len * 0.55
  const ux = (to.x - from.x) / d
  const uy = (to.y - from.y) / d
  ctx.fillStyle = style.color
  ctx.beginPath()
  ctx.moveTo(to.x, to.y)
  ctx.lineTo(to.x - ux * len - uy * half, to.y - uy * len + ux * half)
  ctx.lineTo(to.x - ux * len + uy * half, to.y - uy * len - ux * half)
  ctx.closePath()
  ctx.fill()
}

// Thin by default: shapes and multi-line tools, where 2px reads heavy.
const THIN = new Set<AnnotationType>([
  'rectangle',
  'ellipse',
  'triangle',
  'fib',
  'fibExtension',
  'gannFan',
  'channel',
  'pitchfork',
  'regression',
  'callout',
  'longPosition',
  'shortPosition',
  'measure',
])
// Filled with the line color, translucent, unless styled.
const FILLED = new Set<AnnotationType>([
  'rectangle',
  'ellipse',
  'triangle',
  'channel',
  'pitchfork',
  'regression',
  'measure',
])
// A solid box in the line color.
const BOXED = new Set<AnnotationType>(['callout', 'priceLabel'])
// Text on a colored box: white unless styled.
const WHITE_TEXT = new Set<AnnotationType>(['callout', 'priceLabel', 'measure'])
const DEFAULT_FILL_ALPHA = 0.15

export function resolveStyle(
  ann: Annotation,
  theme: ChartTheme,
): ResolvedStyle {
  const { style, type } = ann
  const color = style.color ?? defaultColor(ann, theme)
  const fontSize =
    style.fontSize ??
    (type === 'text' || type === 'callout' ? 14 : theme.fontSize)
  const boxed = BOXED.has(type)
  return {
    color,
    lineWidth: style.lineWidth ?? (THIN.has(type) ? 1 : 2),
    lineStyle: style.lineStyle ?? 'solid',
    fontSize,
    font: font(style, fontSize, theme),
    textColor: style.textColor ?? (WHITE_TEXT.has(type) ? '#ffffff' : color),
    fill: style.fillColor ?? (FILLED.has(type) || boxed ? color : null),
    fillAlpha: style.fillColor || boxed ? 1 : DEFAULT_FILL_ALPHA,
    extend: style.extend ?? 'none',
    arrow: style.arrow ?? 'none',
  }
}

/**
 * The style a drawing paints with, defaults filled in (fill: as a color
 * with its opacity, where it has one) — e.g. for a style editor to show.
 */
export function effectiveStyle(
  ann: Annotation,
  theme: ChartTheme,
): AnnotationStyle {
  const r = resolveStyle(ann, theme)
  const out: AnnotationStyle = {
    color: r.color,
    lineWidth: r.lineWidth,
    lineStyle: r.lineStyle,
    fontSize: r.fontSize,
    fontFamily: ann.style.fontFamily ?? theme.fontFamily,
    bold: !!ann.style.bold,
    italic: !!ann.style.italic,
    textColor: r.textColor,
    extend: r.extend,
    arrow: r.arrow,
  }
  if (r.fill) out.fillColor = withAlpha(r.fill, r.fillAlpha)
  return out
}

function font(style: AnnotationStyle, size: number, theme: ChartTheme): string {
  return `${style.italic ? 'italic ' : ''}${style.bold ? 'bold ' : ''}${size}px ${style.fontFamily ?? theme.fontFamily}`
}

function defaultColor(ann: Annotation, theme: ChartTheme): string {
  if (ann.type === 'text') return theme.axisTextColor
  if (ann.type === 'longPosition' || ann.type === 'shortPosition') {
    return theme.axisTextColor
  }
  if (ann.shape === 'arrowUp') return theme.upColor
  if (ann.shape === 'arrowDown') return theme.downColor
  return theme.lineColor
}

/** `#rgb`/`#rrggbb`/`rgb()` at opacity `alpha`; other colors as they are. */
export function withAlpha(color: string, alpha: number): string {
  if (alpha >= 1) return color
  const hex = color.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)
  if (hex) {
    const h =
      hex[1]!.length === 3 ? [...hex[1]!].map(c => c + c).join('') : hex[1]!
    const a = Math.round(alpha * 255)
      .toString(16)
      .padStart(2, '0')
    return `#${h}${a}`
  }
  const rgb = color.match(
    /^rgb\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)\s*\)$/i,
  )
  if (rgb) return `rgba(${rgb[1]}, ${rgb[2]}, ${rgb[3]}, ${alpha})`
  return color
}

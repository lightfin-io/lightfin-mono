import type { PlotRect } from '../chart/chart'
import type { LabelAnchor, Resolved, ResolvedStyle, ToolSpec } from './draw'
import {
  HIT_SLOP,
  arrowHead,
  arrowLength,
  fillPolygon,
  line,
  stroke,
} from './draw'
import type { Px } from './geometry'
import {
  add,
  crisp,
  distToSegment,
  extendLine,
  inPolygon,
  mid,
  sub,
} from './geometry'
import type { LineEnds } from './types'

const has = (ends: LineEnds, end: 'start' | 'end') =>
  ends === end || ends === 'both'

/** Stroke `a`–`b`, extended and with arrowheads per the style. */
function drawLine(
  ctx: CanvasRenderingContext2D,
  a: Px,
  b: Px,
  style: ResolvedStyle,
): void {
  let [s, e] = extendLine(a, b, style.extend)
  // Stop the shaft short of an arrowhead so a thick line can't poke out of its tip.
  const len = Math.hypot(b.x - a.x, b.y - a.y)
  const cut = len > 0 ? (arrowLength(style.lineWidth) * 0.8) / len : 0
  const headStart = has(style.arrow, 'start') && !has(style.extend, 'start')
  const headEnd = has(style.arrow, 'end') && !has(style.extend, 'end')
  if (headStart) s = { x: a.x + (b.x - a.x) * cut, y: a.y + (b.y - a.y) * cut }
  if (headEnd) e = { x: b.x - (b.x - a.x) * cut, y: b.y - (b.y - a.y) * cut }
  stroke(ctx, style)
  line(ctx, s, e)
  if (headStart) arrowHead(ctx, b, a, style)
  if (headEnd) arrowHead(ctx, a, b, style)
}

function hitLine(a: Px, b: Px, style: ResolvedStyle, p: Px): boolean {
  const [s, e] = extendLine(a, b, style.extend)
  return distToSegment(p, s, e) <= HIT_SLOP + style.lineWidth / 2
}

/** Above a line's midpoint. */
const midCaption = (a: Px, b: Px, style: ResolvedStyle): LabelAnchor => ({
  x: (a.x + b.x) / 2,
  y: (a.y + b.y) / 2 - style.lineWidth - 3,
  align: 'center',
  baseline: 'bottom',
})

/** Above the right end of a horizontal line at `y`. */
const rightCaption = (
  y: number,
  style: ResolvedStyle,
  pane: PlotRect,
): LabelAnchor => ({
  x: pane.left + pane.width - 4,
  y: y - style.lineWidth - 2,
  align: 'right',
  baseline: 'bottom',
})

function hLine(
  ctx: CanvasRenderingContext2D,
  y: number,
  x0: number,
  x1: number,
  style: ResolvedStyle,
  dpr: number,
): void {
  const cy = crisp(y, style.lineWidth, dpr)
  stroke(ctx, style)
  line(ctx, { x: x0, y: cy }, { x: x1, y: cy })
}

function vLine(
  ctx: CanvasRenderingContext2D,
  x: number,
  pane: PlotRect,
  style: ResolvedStyle,
  dpr: number,
): void {
  const cx = crisp(x, style.lineWidth, dpr)
  stroke(ctx, style)
  line(ctx, { x: cx, y: pane.top }, { x: cx, y: pane.top + pane.height })
}

/**
 * A channel's base line (first two points), its parallel through the third,
 * and the median between them. Offset vertically, so in price; sideways for
 * a vertical base.
 */
export function channelLines({ px: [a, b, c] }: Resolved): {
  base: [Px, Px]
  parallel: [Px, Px]
  median: [Px, Px]
} {
  const dx = b!.x - a!.x
  const offset =
    Math.abs(dx) < 1e-9
      ? { x: c!.x - a!.x, y: 0 }
      : { x: 0, y: c!.y - (a!.y + ((b!.y - a!.y) * (c!.x - a!.x)) / dx) }
  const half = { x: offset.x / 2, y: offset.y / 2 }
  return {
    base: [a!, b!],
    parallel: [add(a!, offset), add(b!, offset)],
    median: [add(a!, half), add(b!, half)],
  }
}

/** A pitchfork's tines: median from the pivot, parallels through the other two. */
function pitchforkLines({
  px: [p0, p1, p2],
}: Resolved): [[Px, Px], [Px, Px], [Px, Px]] {
  const m = mid(p1!, p2!)
  const dir = sub(m, p0!)
  return [
    extendLine(p0!, m, 'end'),
    extendLine(p1!, add(p1!, dir), 'end'),
    extendLine(p2!, add(p2!, dir), 'end'),
  ]
}

export const LINE_TOOLS = {
  trendline: {
    points: 2,
    handles: [
      [0, 0],
      [1, 1],
    ],
    draw: (ctx, { px: [a, b], style }) => drawLine(ctx, a!, b!, style),
    hit: ({ px: [a, b], style }, p) => hitLine(a!, b!, style, p),
    caption: ({ px: [a, b], style }) => midCaption(a!, b!, style),
  },

  hline: {
    points: 1,
    handles: [[0, 0]],
    badge: true,
    draw: (ctx, { px: [a], style }, { pane, dpr }) =>
      hLine(ctx, a!.y, pane.left, pane.left + pane.width, style, dpr),
    hit: ({ px: [a] }, p) => Math.abs(p.y - a!.y) <= HIT_SLOP,
    caption: ({ px: [a], style }, { pane }) => rightCaption(a!.y, style, pane),
  },

  hray: {
    points: 1,
    handles: [[0, 0]],
    badge: true,
    draw: (ctx, { px: [a], style }, { pane, dpr }) =>
      hLine(ctx, a!.y, a!.x, pane.left + pane.width, style, dpr),
    hit: ({ px: [a] }, p) =>
      p.x >= a!.x - HIT_SLOP && Math.abs(p.y - a!.y) <= HIT_SLOP,
    caption: ({ px: [a], style }, { pane }) => rightCaption(a!.y, style, pane),
  },

  vline: {
    points: 1,
    handles: [[0, 0]],
    draw: (ctx, { px: [a], style }, { pane, dpr }) =>
      vLine(ctx, a!.x, pane, style, dpr),
    hit: ({ px: [a] }, p) => Math.abs(p.x - a!.x) <= HIT_SLOP,
    // At the bottom, clear of the legend in the top-left.
    caption: ({ px: [a], style }, { pane }) => ({
      x: a!.x + style.lineWidth + 3,
      y: pane.top + pane.height - 4,
      align: 'left',
      baseline: 'bottom',
    }),
  },

  crossline: {
    points: 1,
    handles: [[0, 0]],
    badge: true,
    draw(ctx, { px: [a], style }, { pane, dpr }) {
      hLine(ctx, a!.y, pane.left, pane.left + pane.width, style, dpr)
      vLine(ctx, a!.x, pane, style, dpr)
    },
    hit: ({ px: [a] }, p) =>
      Math.abs(p.y - a!.y) <= HIT_SLOP || Math.abs(p.x - a!.x) <= HIT_SLOP,
    caption: ({ px: [a], style }) => ({
      x: a!.x + style.lineWidth + 4,
      y: a!.y - style.lineWidth - 3,
      align: 'left',
      baseline: 'bottom',
    }),
  },

  channel: {
    points: 3,
    handles: [
      [0, 0],
      [1, 1],
      [2, 2],
    ],
    draw(ctx, r) {
      const { style } = r
      const { base, parallel, median } = channelLines(r)
      const ext = (l: [Px, Px]) => extendLine(l[0], l[1], style.extend)
      const [b0, b1] = ext(base)
      const [p0, p1] = ext(parallel)
      fillPolygon(ctx, style, [b0, b1, p1, p0])
      stroke(ctx, style)
      line(ctx, b0, b1)
      line(ctx, p0, p1)
      stroke(ctx, { ...style, lineStyle: 'dashed' })
      const [m0, m1] = ext(median)
      line(ctx, m0, m1)
    },
    hit(r, p) {
      const { style } = r
      const { base, parallel } = channelLines(r)
      const [b0, b1] = extendLine(base[0], base[1], style.extend)
      const [p0, p1] = extendLine(parallel[0], parallel[1], style.extend)
      return (
        distToSegment(p, b0, b1) <= HIT_SLOP ||
        distToSegment(p, p0, p1) <= HIT_SLOP ||
        inPolygon(p, [b0, b1, p1, p0])
      )
    },
    caption: r => {
      const { base, parallel } = channelLines(r)
      const top = base[0].y + base[1].y < parallel[0].y + parallel[1].y
      const [a, b] = top ? base : parallel
      return midCaption(a, b, r.style)
    },
  },

  pitchfork: {
    points: 3,
    handles: [
      [0, 0],
      [1, 1],
      [2, 2],
    ],
    draw(ctx, r) {
      const { style } = r
      const [median, upper, lower] = pitchforkLines(r)
      fillPolygon(ctx, style, [upper[0], upper[1], lower[1], lower[0]], 0.6)
      stroke(ctx, style)
      line(ctx, r.px[1]!, r.px[2]!)
      line(ctx, upper[0], upper[1])
      line(ctx, lower[0], lower[1])
      stroke(ctx, { ...style, lineStyle: 'dashed' })
      line(ctx, median[0], median[1])
    },
    hit: (r, p) =>
      distToSegment(p, r.px[1]!, r.px[2]!) <= HIT_SLOP ||
      pitchforkLines(r).some(([a, b]) => distToSegment(p, a, b) <= HIT_SLOP),
    caption: ({ px: [a], style }) => ({
      x: a!.x,
      y: a!.y + style.lineWidth + 4,
      align: 'center',
      baseline: 'top',
    }),
  },

  regression: {
    points: 2,
    handles: [
      [0, 0],
      [1, 1],
    ],
    // On the fitted line, at the first and last bar it covers.
    handleAt: (r, i) => {
      const fit = r.fit
      if (!fit) return r.px[i]!
      const first = r.px[0]!.x <= r.px[1]!.x
      return (i === 0) === first ? fit.a : fit.b
    },
    draw(ctx, r) {
      const { style, fit } = r
      if (!fit) {
        stroke(ctx, { ...style, lineStyle: 'dashed' })
        line(ctx, r.px[0]!, r.px[1]!)
        return
      }
      const up = { x: 0, y: -fit.band }
      const down = { x: 0, y: fit.band }
      const top = [add(fit.a, up), add(fit.b, up)] as const
      const bottom = [add(fit.a, down), add(fit.b, down)] as const
      fillPolygon(ctx, style, [top[0], top[1], bottom[1], bottom[0]], 0.6)
      stroke(ctx, style)
      line(ctx, top[0], top[1])
      line(ctx, bottom[0], bottom[1])
      stroke(ctx, { ...style, lineStyle: 'dashed' })
      line(ctx, fit.a, fit.b)
    },
    hit({ px: [a, b], fit }, p) {
      if (!fit) return distToSegment(p, a!, b!) <= HIT_SLOP
      const up = { x: 0, y: -fit.band }
      const down = { x: 0, y: fit.band }
      return (
        distToSegment(p, fit.a, fit.b) <= HIT_SLOP ||
        inPolygon(p, [
          add(fit.a, up),
          add(fit.b, up),
          add(fit.b, down),
          add(fit.a, down),
        ])
      )
    },
    caption: r => {
      const fit = r.fit
      if (!fit) return midCaption(r.px[0]!, r.px[1]!, r.style)
      const off = { x: 0, y: -fit.band }
      return midCaption(add(fit.a, off), add(fit.b, off), r.style)
    },
  },
} satisfies Record<string, ToolSpec>

import type { Resolved, ToolSpec } from './draw'
import { HIT_SLOP, fillLabel, line, stroke } from './draw'
import type { Px } from './geometry'
import { distToSegment, inBox } from './geometry'

// Marker geometry, CSS px: an arrow's tip sits GAP off its point, then a
// HEAD-tall head and a SHAFT-long stem.
const MARKER_GAP = 4
const MARKER_HEAD = 8
const MARKER_HALF = 6
const MARKER_SHAFT = 8
const MARKER_STEM = 2
const MARKER_RADIUS = 5
// A flag: a POLE-tall pole up from its point, a FLAG_W × FLAG_H flag on top.
const FLAG_POLE = 20
const FLAG_W = 13
const FLAG_H = 9

const LABEL_PAD = 6
// A price label's bubble sits this far above-right of its point.
const BUBBLE_OFFSET = 8

/** A marker's shape extent. */
function markerBox({ ann, px: [a] }: Resolved): { a: Px; b: Px } {
  const { x, y } = a!
  if (!ann.shape || ann.shape === 'circle') {
    const r = MARKER_RADIUS
    return { a: { x: x - r, y: y - r }, b: { x: x + r, y: y + r } }
  }
  if (ann.shape === 'flag') {
    return { a: { x: x - 1, y: y - FLAG_POLE }, b: { x: x + FLAG_W, y } }
  }
  const dir = ann.shape === 'arrowUp' ? 1 : -1
  const near = y + dir * MARKER_GAP
  const far = near + dir * (MARKER_HEAD + MARKER_SHAFT)
  return {
    a: { x: x - MARKER_HALF, y: Math.min(near, far) },
    b: { x: x + MARKER_HALF, y: Math.max(near, far) },
  }
}

export const LABEL_TOOLS = {
  text: {
    points: 1,
    handles: [],
    editsText: true,
    draw(ctx, r) {
      if (!r.ann.text) return
      const [a] = r.px
      const fill = r.style.fill
      fillLabel(
        ctx,
        r,
        r.ann.text,
        { ...a!, align: 'left', baseline: 'middle' },
        fill ? { color: fill, alpha: r.style.fillAlpha, pad: 4 } : undefined,
      )
    },
    // Grabbed by its label (see hitAnnotation).
    hit: () => false,
  },

  callout: {
    points: 2,
    handles: [
      [0, 0],
      [1, 1],
    ],
    editsText: true,
    draw(ctx, r) {
      const [a, b] = r.px
      const { style } = r
      stroke(ctx, { ...style, lineStyle: 'solid' })
      line(ctx, a!, b!)
      ctx.fillStyle = style.fill ?? style.color
      ctx.beginPath()
      ctx.arc(a!.x, a!.y, Math.max(2, style.lineWidth + 1), 0, Math.PI * 2)
      ctx.fill()
      fillLabel(
        ctx,
        r,
        r.ann.text || ' ',
        { ...b!, align: 'center', baseline: 'middle' },
        {
          color: style.fill ?? style.color,
          alpha: style.fillAlpha,
          pad: LABEL_PAD,
        },
      )
    },
    hit: ({ px: [a, b] }, p) => distToSegment(p, a!, b!) <= HIT_SLOP,
  },

  priceLabel: {
    points: 1,
    handles: [[0, 0]],
    draw(ctx, r, { formatPrice }) {
      const [a] = r.px
      const { style } = r
      const price = formatPrice(r.ann.points[0]!.price)
      const color = style.fill ?? style.color
      const box = fillLabel(
        ctx,
        r,
        r.ann.text ? `${r.ann.text} ${price}` : price,
        {
          x: a!.x + BUBBLE_OFFSET,
          y: a!.y - BUBBLE_OFFSET - 4,
          align: 'left',
          baseline: 'bottom',
        },
        { color, alpha: style.fillAlpha, pad: 4 },
      )
      // The bubble's tail, down to the point.
      ctx.save()
      ctx.globalAlpha = style.fillAlpha
      ctx.fillStyle = color
      ctx.beginPath()
      ctx.moveTo(a!.x, a!.y)
      ctx.lineTo(box.a.x, box.b.y - 3)
      ctx.lineTo(box.a.x + BUBBLE_OFFSET, box.b.y - 0.5)
      ctx.closePath()
      ctx.fill()
      ctx.restore()
    },
    hit: ({ px: [a] }, p) => Math.hypot(p.x - a!.x, p.y - a!.y) <= HIT_SLOP,
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
      } else if (ann.shape === 'flag') {
        ctx.rect(x - 1, y - FLAG_POLE, 2, FLAG_POLE)
        ctx.moveTo(x + 1, y - FLAG_POLE)
        ctx.lineTo(x + FLAG_W, y - FLAG_POLE + FLAG_H / 2)
        ctx.lineTo(x + 1, y - FLAG_POLE + FLAG_H)
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
      }
      ctx.closePath()
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
} satisfies Record<string, ToolSpec>

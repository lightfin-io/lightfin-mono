import type { ToolSpec } from './draw'
import { HIT_SLOP, fillPolygon, stroke } from './draw'
import {
  crisp,
  distToPolyline,
  distToSegment,
  inBox,
  inEllipse,
  inPolygon,
} from './geometry'

/** Top-left inside a box between two corners. */
const boxCaption: ToolSpec['caption'] = ({ px: [a, b] }) => ({
  x: Math.min(a!.x, b!.x) + 4,
  y: Math.min(a!.y, b!.y) + 4,
  align: 'left',
  baseline: 'top',
})

const CORNERS = [
  [0, 0],
  [1, 1],
  [0, 1],
  [1, 0],
] as const

export const SHAPE_TOOLS = {
  rectangle: {
    points: 2,
    handles: CORNERS,
    draw(ctx, { px: [a, b], style }, { dpr }) {
      const w = style.lineWidth
      const x0 = crisp(Math.min(a!.x, b!.x), w, dpr)
      const x1 = crisp(Math.max(a!.x, b!.x), w, dpr)
      const y0 = crisp(Math.min(a!.y, b!.y), w, dpr)
      const y1 = crisp(Math.max(a!.y, b!.y), w, dpr)
      fillPolygon(ctx, style, [
        { x: x0, y: y0 },
        { x: x1, y: y0 },
        { x: x1, y: y1 },
        { x: x0, y: y1 },
      ])
      stroke(ctx, style)
      ctx.strokeRect(x0, y0, x1 - x0, y1 - y0)
    },
    hit: ({ px: [a, b] }, p) => inBox(p, a!, b!, HIT_SLOP),
    caption: boxCaption,
  },

  ellipse: {
    points: 2,
    handles: CORNERS,
    draw(ctx, { px: [a, b], style }) {
      const rx = Math.abs(b!.x - a!.x) / 2
      const ry = Math.abs(b!.y - a!.y) / 2
      ctx.beginPath()
      ctx.ellipse(
        (a!.x + b!.x) / 2,
        (a!.y + b!.y) / 2,
        rx,
        ry,
        0,
        0,
        Math.PI * 2,
      )
      if (style.fill) {
        ctx.save()
        ctx.globalAlpha = style.fillAlpha
        ctx.fillStyle = style.fill
        ctx.fill()
        ctx.restore()
      }
      stroke(ctx, style)
      ctx.stroke()
    },
    hit: ({ px: [a, b] }, p) => inEllipse(p, a!, b!, HIT_SLOP),
    caption: ({ px: [a, b] }) => ({
      x: (a!.x + b!.x) / 2,
      y: Math.min(a!.y, b!.y) - 3,
      align: 'center',
      baseline: 'bottom',
    }),
  },

  triangle: {
    points: 3,
    handles: [
      [0, 0],
      [1, 1],
      [2, 2],
    ],
    draw(ctx, { px, style }) {
      fillPolygon(ctx, style, px)
      stroke(ctx, style)
      ctx.beginPath()
      px.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)))
      ctx.closePath()
      ctx.stroke()
    },
    hit: ({ px }, p) =>
      inPolygon(p, px) ||
      px.some((a, i) => distToSegment(p, a, px[(i + 1) % 3]!) <= HIT_SLOP),
    caption: ({ px }) => ({
      x: px.reduce((s, p) => s + p.x, 0) / 3,
      y: Math.min(...px.map(p => p.y)) - 3,
      align: 'center',
      baseline: 'bottom',
    }),
  },

  brush: {
    points: 2,
    freehand: true,
    handles: [],
    draw(ctx, { px, style }) {
      ctx.save()
      stroke(ctx, style)
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.beginPath()
      ctx.moveTo(px[0]!.x, px[0]!.y)
      // Through the midpoints, each sample a control point: smooth, no corners.
      for (let i = 1; i < px.length - 1; i++) {
        const p = px[i]!
        const q = px[i + 1]!
        ctx.quadraticCurveTo(p.x, p.y, (p.x + q.x) / 2, (p.y + q.y) / 2)
      }
      const last = px[px.length - 1]!
      ctx.lineTo(last.x, last.y)
      ctx.stroke()
      ctx.restore()
    },
    hit: ({ px, style }, p) =>
      distToPolyline(p, px) <= HIT_SLOP + style.lineWidth / 2,
    caption: ({ px }) => {
      const top = px.reduce((t, p) => (p.y < t.y ? p : t))
      return { x: top.x, y: top.y - 6, align: 'center', baseline: 'bottom' }
    },
  },
} satisfies Record<string, ToolSpec>

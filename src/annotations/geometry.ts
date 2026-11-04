import type { LineEnds } from './types'

export interface Px {
  x: number
  y: number
}

/** Distance from `p` to the segment `a`–`b`. */
export function distToSegment(p: Px, a: Px, b: Px): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  const t =
    len2 === 0
      ? 0
      : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2))
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

/** Distance from `p` to the nearest segment of a polyline. */
export function distToPolyline(p: Px, pts: readonly Px[]): number {
  if (pts.length === 1) return Math.hypot(p.x - pts[0]!.x, p.y - pts[0]!.y)
  let min = Infinity
  for (let i = 1; i < pts.length; i++) {
    min = Math.min(min, distToSegment(p, pts[i - 1]!, pts[i]!))
  }
  return min
}

/** Whether `p` lies within the box spanned by `a` and `b`, grown by `pad`. */
export function inBox(p: Px, a: Px, b: Px, pad = 0): boolean {
  return (
    p.x >= Math.min(a.x, b.x) - pad &&
    p.x <= Math.max(a.x, b.x) + pad &&
    p.y >= Math.min(a.y, b.y) - pad &&
    p.y <= Math.max(a.y, b.y) + pad
  )
}

/** Whether `p` lies inside a polygon (even-odd rule). */
export function inPolygon(p: Px, pts: readonly Px[]): boolean {
  let inside = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i]!
    const b = pts[j]!
    if (
      a.y > p.y !== b.y > p.y &&
      p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x
    ) {
      inside = !inside
    }
  }
  return inside
}

/**
 * Whether `p` lies inside the ellipse inscribed in the box spanned by `a`
 * and `b`, grown by `pad`.
 */
export function inEllipse(p: Px, a: Px, b: Px, pad = 0): boolean {
  const rx = Math.abs(b.x - a.x) / 2 + pad
  const ry = Math.abs(b.y - a.y) / 2 + pad
  if (rx <= 0 || ry <= 0) return false
  const dx = (p.x - (a.x + b.x) / 2) / rx
  const dy = (p.y - (a.y + b.y) / 2) / ry
  return dx * dx + dy * dy <= 1
}

export const add = (a: Px, b: Px): Px => ({ x: a.x + b.x, y: a.y + b.y })
export const sub = (a: Px, b: Px): Px => ({ x: a.x - b.x, y: a.y - b.y })
export const mid = (a: Px, b: Px): Px => ({
  x: (a.x + b.x) / 2,
  y: (a.y + b.y) / 2,
})

// Far enough past any pane that an extended line's end is off screen.
const FAR = 1e5

/** The segment `a`–`b`, run out past the chosen ends. */
export function extendLine(a: Px, b: Px, ends: LineEnds): [Px, Px] {
  const len = Math.hypot(b.x - a.x, b.y - a.y)
  if (len === 0 || ends === 'none') return [a, b]
  const k = FAR / len
  const dx = (b.x - a.x) * k
  const dy = (b.y - a.y) * k
  return [
    ends === 'start' || ends === 'both' ? { x: a.x - dx, y: a.y - dy } : a,
    ends === 'end' || ends === 'both' ? { x: b.x + dx, y: b.y + dy } : b,
  ]
}

/**
 * Snap a CSS-px coordinate so a horizontal/vertical line `lineWidth` CSS px
 * wide covers whole device pixels: centered on a pixel for odd device widths,
 * on a pixel edge for even ones.
 */
export function crisp(cssPx: number, lineWidth: number, dpr: number): number {
  const odd = Math.max(1, Math.round(lineWidth * dpr)) % 2 === 1
  return (Math.round(cssPx * dpr) + (odd ? 0.5 : 0)) / dpr
}

/** A least-squares line through closes: its price at the first and last bar, and the residuals' deviation. */
export interface Fit {
  from: number
  to: number
  start: number
  end: number
  deviation: number
}

/** Fit a line through the closes of `bars` (oldest first) by bar index; null under two bars. */
export function fitCloses(
  bars: readonly { time: number; close: number }[],
): Fit | null {
  const n = bars.length
  if (n < 2) return null
  const meanX = (n - 1) / 2
  let meanY = 0
  for (const b of bars) meanY += b.close / n
  let num = 0
  let den = 0
  bars.forEach((b, x) => {
    num += (x - meanX) * (b.close - meanY)
    den += (x - meanX) ** 2
  })
  const slope = num / den
  const at = (x: number) => meanY + slope * (x - meanX)
  let ss = 0
  bars.forEach((b, x) => (ss += (b.close - at(x)) ** 2))
  return {
    from: bars[0]!.time,
    to: bars[n - 1]!.time,
    start: at(0),
    end: at(n - 1),
    deviation: Math.sqrt(ss / n),
  }
}

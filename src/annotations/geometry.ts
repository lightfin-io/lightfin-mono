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

/** Whether `p` lies within the box spanned by `a` and `b`, grown by `pad`. */
export function inBox(p: Px, a: Px, b: Px, pad = 0): boolean {
  return (
    p.x >= Math.min(a.x, b.x) - pad &&
    p.x <= Math.max(a.x, b.x) + pad &&
    p.y >= Math.min(a.y, b.y) - pad &&
    p.y <= Math.max(a.y, b.y) + pad
  )
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

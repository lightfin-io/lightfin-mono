import type { UTCTimestamp } from '../data/types'

/**
 * Fired when the user clicks the crosshair's "+" order button (PLAN §8.2).
 * The chart owns only the button; the host renders any order form.
 */
export interface OrderIntentEvent {
  /** Price at the crosshair's horizontal line (snapped, in magnet mode). */
  price: number
  /** Time of the bar under the pointer, or null past either end of the data. */
  time: UTCTimestamp | null
  /** Logical index of the slot under the pointer; may lie outside the data. */
  index: number
  /** The pane the button sat in — `'main'`, the price pane. */
  paneId: string
  /** Click position in CSS px relative to the chart element. */
  point: { x: number; y: number }
  /** Click position in viewport coordinates, for positioning a host popup. */
  clientPoint: { x: number; y: number }
}

export interface ButtonRect {
  left: number
  top: number
  size: number
}

/**
 * The "+" button: a square flush against the price-axis gutter (`plotRight`),
 * centered on the crosshair line at `lineY` and kept inside `[top, bottom]`.
 */
export function orderButtonRect(
  plotRight: number,
  lineY: number,
  size: number,
  top: number,
  bottom: number,
): ButtonRect {
  const y = Math.min(Math.max(lineY - size / 2, top), bottom - size)
  return { left: plotRight - size, top: y, size }
}

export function hitsButton(
  rect: ButtonRect,
  point: { x: number; y: number },
): boolean {
  return (
    point.x >= rect.left &&
    point.x <= rect.left + rect.size &&
    point.y >= rect.top &&
    point.y <= rect.top + rect.size
  )
}

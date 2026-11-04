import type { PlotRect } from '../chart/chart'
import type { ColumnStore } from '../data/store'
import type { TimeScale } from '../scales/timeScale'
import type { IndexWindow } from './series'

export interface VolumeStyle {
  /** Largest volume in the visible window — the top of the hidden scale. */
  max: number
  /** Fraction of the plot height the histogram occupies, anchored to the bottom. */
  heightRatio: number
  upColor: string
  downColor: string
}

/**
 * Volume histogram on a hidden, pane-local scale (PLAN §7). Bars are anchored
 * to the bottom of the plot and occupy the bottom `heightRatio` slice, scaled
 * so the tallest visible bar fills the region (0 → `max`). It is *not* an axis:
 * no labels, no gridlines — exactly TradingView's hidden volume scale.
 *
 * Drawn behind the candles with the §9 batching rule: bucket into up vs down by
 * candle direction, accumulate every bar as a `rect()` subpath in one of two
 * paths, and `fill()` each once — two draw calls regardless of bar count.
 */
export function drawVolume(
  ctx: CanvasRenderingContext2D,
  store: ColumnStore,
  window: IndexWindow,
  timeScale: TimeScale,
  plot: PlotRect,
  style: VolumeStyle,
  dpr: number,
): void {
  if (window.from > window.to || style.max <= 0) return

  const baseline = plot.top + plot.height
  const region = plot.height * style.heightRatio
  const bodyW = Math.max(1 / dpr, timeScale.barWidth * 0.8)
  const halfBody = bodyW / 2

  const up = new Path2D()
  const down = new Path2D()

  for (let i = window.from; i <= window.to; i++) {
    const p = store.physical(i)
    const v = store.volumes[p]!
    if (Number.isNaN(v) || v <= 0) continue

    const barH = (v / style.max) * region
    const cx = plot.left + timeScale.indexToX(i)
    const x = snap(cx - halfBody, dpr)
    const y = snap(baseline - barH, dpr)
    const path = store.closes[p]! >= store.opens[p]! ? up : down
    path.rect(x, y, bodyW, Math.max(1, baseline - y))
  }

  ctx.save()
  ctx.beginPath()
  ctx.rect(plot.left, plot.top, plot.width, plot.height)
  ctx.clip()
  ctx.fillStyle = style.upColor
  ctx.fill(up)
  ctx.fillStyle = style.downColor
  ctx.fill(down)
  ctx.restore()
}

/** Snap a CSS-px coordinate to a whole device pixel for crisp edges (PLAN §9). */
function snap(cssPx: number, dpr: number): number {
  return Math.round(cssPx * dpr) / dpr
}

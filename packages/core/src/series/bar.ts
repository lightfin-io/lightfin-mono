import type { PlotRect } from '../chart/chart'
import type { ChartTheme } from '../chart/options'
import type { ColumnStore } from '../data/store'
import type { PriceScale } from '../scales/priceScale'
import type { TimeScale } from '../scales/timeScale'
import type { IndexWindow } from './series'

/**
 * OHLC bar renderer: a vertical high–low stem with the open as a tick to the
 * left and the close as a tick to the right, colored by direction. Like the
 * candles, every stem and tick is a `rect()` subpath in one of two paths
 * (up/down), so the whole series is two fills (PLAN §9). The caller clips to
 * `plot`.
 */
export function drawOhlcBars(
  ctx: CanvasRenderingContext2D,
  store: ColumnStore,
  window: IndexWindow,
  timeScale: TimeScale,
  priceScale: PriceScale,
  plot: PlotRect,
  theme: ChartTheme,
  dpr: number,
): void {
  const h = plot.height
  // Stroke thickness grows with zoom (1 device px when dense, up to 3 CSS px
  // when wide) so bars stay legible without turning into blocks.
  const thickPx = Math.max(1, Math.round(timeScale.barWidth * 0.12 * dpr))
  const thick = Math.min(Math.round(3 * dpr), thickPx) / dpr
  // Ticks reach ~40% of the slot either side of the stem; none when too dense
  // for them to read (then the stem alone carries the high–low range).
  const tickLen = snap(Math.max(0, timeScale.barWidth * 0.4 - thick / 2), dpr)

  const up = new Path2D()
  const down = new Path2D()

  for (let i = window.from; i <= window.to; i++) {
    const p = store.physical(i)
    const open = store.opens[p]!
    const close = store.closes[p]!
    const path = close >= open ? up : down

    const cx = plot.left + timeScale.indexToX(i)
    const stemX = snap(cx - thick / 2, dpr)
    const yHigh = plot.top + priceScale.priceToY(store.highs[p]!, h)
    const yLow = plot.top + priceScale.priceToY(store.lows[p]!, h)
    path.rect(stemX, yHigh, thick, Math.max(thick, yLow - yHigh))

    if (tickLen <= 0) continue
    const yOpen = snap(plot.top + priceScale.priceToY(open, h) - thick / 2, dpr)
    const yClose = snap(
      plot.top + priceScale.priceToY(close, h) - thick / 2,
      dpr,
    )
    path.rect(stemX - tickLen, yOpen, tickLen, thick)
    path.rect(stemX + thick, yClose, tickLen, thick)
  }

  ctx.fillStyle = theme.upColor
  ctx.fill(up)
  ctx.fillStyle = theme.downColor
  ctx.fill(down)
}

/** Snap a CSS-px coordinate to a whole device pixel for crisp edges (PLAN §9). */
function snap(cssPx: number, dpr: number): number {
  return Math.round(cssPx * dpr) / dpr
}

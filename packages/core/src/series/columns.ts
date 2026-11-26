import type { PlotRect } from '../chart/chart'
import type { ChartTheme } from '../chart/options'
import type { ColumnStore } from '../data/store'
import type { PriceScale } from '../scales/priceScale'
import type { TimeScale } from '../scales/timeScale'
import type { IndexWindow } from './series'

/** One column per close, colored by bar direction. */
export function drawColumns(
  ctx: CanvasRenderingContext2D,
  store: ColumnStore,
  window: IndexWindow,
  timeScale: TimeScale,
  priceScale: PriceScale,
  plot: PlotRect,
  theme: ChartTheme,
  dpr: number,
): void {
  const width = Math.max(1, Math.floor(timeScale.barWidth * 0.8 * dpr)) / dpr
  // Use zero when it's in view and the nearest scale edge otherwise.
  const basePrice = Math.max(priceScale.min, Math.min(0, priceScale.max))
  const baseY =
    Math.round((plot.top + priceScale.priceToY(basePrice, plot.height)) * dpr) /
    dpr
  const up = new Path2D()
  const down = new Path2D()
  for (let i = window.from; i <= window.to; i++) {
    const p = store.physical(i)
    const close = store.closes[p]!
    const center = plot.left + timeScale.indexToX(i)
    const x = Math.round((center - width / 2) * dpr) / dpr
    const y =
      Math.round((plot.top + priceScale.priceToY(close, plot.height)) * dpr) /
      dpr
    const path = close >= store.opens[p]! ? up : down
    path.rect(
      x,
      Math.min(y, baseY),
      width,
      Math.max(1 / dpr, Math.abs(baseY - y)),
    )
  }
  ctx.fillStyle = theme.upColor
  ctx.fill(up)
  ctx.fillStyle = theme.downColor
  ctx.fill(down)
}

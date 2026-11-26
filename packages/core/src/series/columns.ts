import type { PlotRect } from '../chart/chart'
import type { ChartTheme } from '../chart/options'
import type { ColumnStore } from '../data/store'
import type { PriceScale } from '../scales/priceScale'
import type { TimeScale } from '../scales/timeScale'
import type { IndexWindow } from './series'

/** One close-to-zero column per bar, colored by the bar's direction. */
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
  const zero =
    Math.round((plot.top + priceScale.priceToY(0, plot.height)) * dpr) / dpr
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
      Math.min(y, zero),
      width,
      Math.max(1 / dpr, Math.abs(zero - y)),
    )
  }
  ctx.fillStyle = theme.upColor
  ctx.fill(up)
  ctx.fillStyle = theme.downColor
  ctx.fill(down)
}

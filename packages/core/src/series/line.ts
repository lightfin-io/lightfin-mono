import type { PlotRect } from '../chart/chart'
import type { ChartTheme } from '../chart/options'
import type { ColumnStore } from '../data/store'
import type { PriceScale } from '../scales/priceScale'
import type { TimeScale } from '../scales/timeScale'
import type { IndexWindow } from './series'

const LINE_WIDTH = 2
/**
 * Fraction of the plot height, up from the bottom, where the area fill has
 * faded out. About the default volume histogram (`volumeHeightRatio` is 0.18)
 * so that band stays clear. Fixed — not tied to the live volume scale.
 */
const AREA_FADE_CLEARANCE = 0.18

/**
 * Line renderer: one polyline through the closes of the visible window, a
 * single `stroke()` for the whole series. The caller clips to `plot`.
 */
export function drawLine(
  ctx: CanvasRenderingContext2D,
  store: ColumnStore,
  window: IndexWindow,
  timeScale: TimeScale,
  priceScale: PriceScale,
  plot: PlotRect,
  theme: ChartTheme,
): void {
  strokeLine(ctx, closePath(store, window, timeScale, priceScale, plot), theme)
}

/**
 * Area renderer: the close line over a vertical gradient. The fill is the
 * line's polyline closed along the pane bottom — one `fill()` plus one
 * `stroke()` — and the gradient reaches {@link ChartTheme.areaBottomColor}
 * (transparent by default) `AREA_FADE_CLEARANCE` up from that edge, then holds,
 * so the lower band where volume sits is clear. The caller clips to `plot`.
 */
export function drawArea(
  ctx: CanvasRenderingContext2D,
  store: ColumnStore,
  window: IndexWindow,
  timeScale: TimeScale,
  priceScale: PriceScale,
  plot: PlotRect,
  theme: ChartTheme,
): void {
  const line = closePath(store, window, timeScale, priceScale, plot)
  const bottom = plot.top + plot.height
  const firstX = plot.left + timeScale.indexToX(window.from)
  const lastX = plot.left + timeScale.indexToX(window.to)

  const area = new Path2D(line)
  area.lineTo(lastX, bottom)
  area.lineTo(firstX, bottom)
  area.closePath()

  const clearY = bottom - plot.height * AREA_FADE_CLEARANCE
  const gradient = ctx.createLinearGradient(0, plot.top, 0, clearY)
  gradient.addColorStop(0, theme.areaTopColor)
  gradient.addColorStop(1, theme.areaBottomColor)
  ctx.fillStyle = gradient
  ctx.fill(area)

  strokeLine(ctx, line, theme)
}

/** The polyline through each visible bar's close, at its slot center. */
function closePath(
  store: ColumnStore,
  window: IndexWindow,
  timeScale: TimeScale,
  priceScale: PriceScale,
  plot: PlotRect,
): Path2D {
  const path = new Path2D()
  for (let i = window.from; i <= window.to; i++) {
    const x = plot.left + timeScale.indexToX(i)
    const y =
      plot.top +
      priceScale.priceToY(store.closes[store.physical(i)]!, plot.height)
    if (i === window.from) path.moveTo(x, y)
    else path.lineTo(x, y)
  }
  return path
}

function strokeLine(
  ctx: CanvasRenderingContext2D,
  path: Path2D,
  theme: ChartTheme,
): void {
  ctx.strokeStyle = theme.lineColor
  ctx.lineWidth = LINE_WIDTH
  ctx.lineJoin = 'round'
  ctx.stroke(path)
}

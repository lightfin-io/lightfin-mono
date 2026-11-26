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
  type: 'line' | 'lineWithMarkers' | 'stepLine',
): void {
  const values = store.closes.subarray(
    store.physical(window.from),
    store.physical(window.to) + 1,
  )
  const path = new Path2D()
  tracePrices(
    path,
    values,
    window.from,
    timeScale,
    priceScale,
    plot,
    type === 'stepLine',
  )
  strokeLine(ctx, path, theme.lineColor)

  if (
    type === 'lineWithMarkers' &&
    (timeScale.barWidth >= 5 || values.length === 1)
  ) {
    const markers = new Path2D()
    const r = Math.min(3, timeScale.barWidth * 0.3)
    for (let i = 0; i < values.length; i++) {
      const x = plot.left + timeScale.indexToX(window.from + i)
      const y = plot.top + priceScale.priceToY(values[i]!, plot.height)
      markers.moveTo(x + r, y)
      markers.arc(x, y, r, 0, 2 * Math.PI)
    }
    ctx.fillStyle = theme.lineColor
    ctx.fill(markers)
  }
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
  const line = new Path2D()
  tracePrices(
    line,
    store.closes.subarray(
      store.physical(window.from),
      store.physical(window.to) + 1,
    ),
    window.from,
    timeScale,
    priceScale,
    plot,
  )
  const bottom = plot.top + plot.height
  const area = areaToY(line, window, timeScale, plot, bottom)

  const clearY = bottom - plot.height * AREA_FADE_CLEARANCE
  const gradient = ctx.createLinearGradient(0, plot.top, 0, clearY)
  gradient.addColorStop(0, theme.areaTopColor)
  gradient.addColorStop(1, theme.areaBottomColor)
  ctx.fillStyle = gradient
  ctx.fill(area)

  strokeLine(ctx, line, theme.lineColor)
}

/** Lightly shaded high-to-close and close-to-low bands, with a close line. */
export function drawHlcArea(
  ctx: CanvasRenderingContext2D,
  store: ColumnStore,
  window: IndexWindow,
  timeScale: TimeScale,
  priceScale: PriceScale,
  plot: PlotRect,
  theme: ChartTheme,
): void {
  const start = store.physical(window.from)
  const end = store.physical(window.to) + 1
  const args = [window.from, timeScale, priceScale, plot] as const
  const closes = store.closes.subarray(start, end)
  const closeLine = new Path2D()
  tracePrices(closeLine, closes, ...args)

  for (const [values, color] of [
    [store.highs, theme.upColor],
    [store.lows, theme.downColor],
  ] as const) {
    const edge = new Path2D()
    tracePrices(edge, values.subarray(start, end), ...args)
    const band = new Path2D(edge)
    for (let i = closes.length - 1; i >= 0; i--) {
      band.lineTo(
        plot.left + timeScale.indexToX(window.from + i),
        plot.top + priceScale.priceToY(closes[i]!, plot.height),
      )
    }
    band.closePath()
    ctx.fillStyle = color
    ctx.globalAlpha = 0.18
    ctx.fill(band)
    ctx.globalAlpha = 0.65
    strokeLine(ctx, edge, color, 1)
  }
  ctx.globalAlpha = 1
  strokeLine(ctx, closeLine, theme.lineColor)
}

/** A close area split at its reference price, with independent colors on each side. */
export function drawBaseline(
  ctx: CanvasRenderingContext2D,
  store: ColumnStore,
  window: IndexWindow,
  timeScale: TimeScale,
  priceScale: PriceScale,
  plot: PlotRect,
  theme: ChartTheme,
  baselinePrice?: number,
): void {
  const line = new Path2D()
  tracePrices(
    line,
    store.closes.subarray(
      store.physical(window.from),
      store.physical(window.to) + 1,
    ),
    window.from,
    timeScale,
    priceScale,
    plot,
  )
  // Autoscale padding is symmetric, so its midpoint follows the price band.
  const price = baselinePrice ?? (priceScale.min + priceScale.max) / 2
  const bottom = plot.top + plot.height
  const yRef = plot.top + priceScale.priceToY(price, plot.height)
  const split = Math.max(plot.top, Math.min(bottom, yRef))
  const area = areaToY(line, window, timeScale, plot, split)
  for (const [top, end, color] of [
    [plot.top, split, theme.upColor],
    [split, bottom, theme.downColor],
  ] as const) {
    if (end <= top) continue
    ctx.save()
    ctx.beginPath()
    ctx.rect(plot.left, top, plot.width, end - top)
    ctx.clip()
    ctx.fillStyle = color
    ctx.globalAlpha = 0.18
    ctx.fill(area)
    ctx.globalAlpha = 1
    strokeLine(ctx, line, color)
    ctx.restore()
  }
  if (yRef >= plot.top && yRef <= bottom) {
    const baseline = new Path2D()
    baseline.moveTo(plot.left, yRef)
    baseline.lineTo(plot.left + plot.width, yRef)
    ctx.setLineDash([4, 4])
    strokeLine(ctx, baseline, theme.crosshairColor, 1)
  }
}

function tracePrices(
  path: Path2D,
  values: Float64Array,
  firstIndex: number,
  timeScale: TimeScale,
  priceScale: PriceScale,
  plot: PlotRect,
  step = false,
): void {
  let previousY = 0
  for (let offset = 0; offset < values.length; offset++) {
    const x = plot.left + timeScale.indexToX(firstIndex + offset)
    const y = plot.top + priceScale.priceToY(values[offset]!, plot.height)
    if (offset === 0) path.moveTo(x, y)
    else {
      if (step) path.lineTo(x, previousY)
      path.lineTo(x, y)
    }
    previousY = y
  }
}

function areaToY(
  line: Path2D,
  window: IndexWindow,
  timeScale: TimeScale,
  plot: PlotRect,
  y: number,
): Path2D {
  const area = new Path2D(line)
  area.lineTo(plot.left + timeScale.indexToX(window.to), y)
  area.lineTo(plot.left + timeScale.indexToX(window.from), y)
  area.closePath()
  return area
}

function strokeLine(
  ctx: CanvasRenderingContext2D,
  path: Path2D,
  color: string,
  width = LINE_WIDTH,
): void {
  ctx.strokeStyle = color
  ctx.lineWidth = width
  ctx.lineJoin = 'round'
  ctx.stroke(path)
}

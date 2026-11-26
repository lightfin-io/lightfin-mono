import type { PlotRect } from '../chart/chart'
import type { ChartTheme } from '../chart/options'
import type { ColumnStore } from '../data/store'
import type { PriceScale } from '../scales/priceScale'
import type { TimeScale } from '../scales/timeScale'
import { heikinAshiClose } from './heikinAshi'
import type { IndexWindow } from './series'

/**
 * Candle and high–low renderers. Bodies, borders and wicks are rectangles
 * batched into one fill per color. The caller clips to the plot.
 */
export function drawCandles(
  ctx: CanvasRenderingContext2D,
  store: ColumnStore,
  window: IndexWindow,
  timeScale: TimeScale,
  priceScale: PriceScale,
  plot: PlotRect,
  theme: ChartTheme,
  dpr: number,
  type:
    | 'candlestick'
    | 'hollowCandles'
    | 'volumeCandles'
    | 'heikinAshi'
    | 'highLow',
  heikinOpens: readonly number[],
  volumeMax: number,
): void {
  const h = plot.height
  // 1 device-pixel wick, expressed in CSS px so it stays crisp at any dpr.
  const wickW = 1 / dpr
  const slotWidthPx = timeScale.barWidth * dpr
  const regularWidth = Math.max(1, Math.floor(slotWidthPx * 0.8)) / dpr
  const minBodyHeight = Math.ceil(dpr) / dpr
  const highLow = type === 'highLow'
  const hollow = type === 'hollowCandles'
  const heikin = type === 'heikinAshi'

  const up = new Path2D()
  const down = new Path2D()

  for (let i = window.from; i <= window.to; i++) {
    const p = store.physical(i)
    const open = heikin ? heikinOpens[i - store.firstIndex]! : store.opens[p]!
    const close = heikin ? heikinAshiClose(store, p) : store.closes[p]!
    const high = heikin
      ? Math.max(store.highs[p]!, open, close)
      : store.highs[p]!
    const low = heikin ? Math.min(store.lows[p]!, open, close) : store.lows[p]!

    const cx = plot.left + timeScale.indexToX(i)
    const reference =
      hollow && i > store.firstIndex ? store.closes[p - 1]! : open
    const path = close >= reference ? up : down
    const volume = volumeMax > 0 ? store.volumes[p]! : NaN
    // Width varies inside a fixed time slot. Missing volume uses the usual
    // width, and a zero-volume body stays visible as a narrow candle.
    const bodyW = Number.isFinite(volume)
      ? Math.max(
          1,
          Math.floor(
            slotWidthPx * (0.2 + (0.6 * Math.max(0, volume)) / volumeMax),
          ),
        ) / dpr
      : regularWidth
    const bodyX = snap(cx - bodyW / 2, dpr)
    const wickX = bodyX + snap((bodyW - wickW) / 2, dpr)

    const yHigh = snap(priceScale.priceToY(high, h) + plot.top, dpr)
    const yLow = snap(priceScale.priceToY(low, h) + plot.top, dpr)
    if (highLow) {
      body(
        path,
        bodyX,
        yHigh,
        bodyW,
        Math.max(wickW, yLow - yHigh),
        wickW,
        true,
      )
      continue
    }

    const yOpen = snap(priceScale.priceToY(open, h) + plot.top, dpr)
    const yClose = snap(priceScale.priceToY(close, h) + plot.top, dpr)
    const bodyTop = Math.min(yOpen, yClose)
    const bodyH = Math.max(minBodyHeight, Math.abs(yClose - yOpen))
    // End the wicks at the body so an outlined candle has a clear interior.
    if (yHigh < bodyTop) path.rect(wickX, yHigh, wickW, bodyTop - yHigh)
    const bodyBottom = bodyTop + bodyH
    if (bodyBottom < yLow)
      path.rect(wickX, bodyBottom, wickW, yLow - bodyBottom)
    body(path, bodyX, bodyTop, bodyW, bodyH, wickW, hollow && close > open)
  }

  ctx.fillStyle = theme.upColor
  ctx.fill(up)
  ctx.fillStyle = theme.downColor
  ctx.fill(down)
}

function body(
  path: Path2D,
  x: number,
  y: number,
  width: number,
  height: number,
  edge: number,
  outlined: boolean,
): void {
  if (!outlined || width <= 2 * edge || height <= 2 * edge) {
    path.rect(x, y, width, height)
    return
  }
  path.rect(x, y, width, edge)
  path.rect(x, y + height - edge, width, edge)
  path.rect(x, y + edge, edge, height - 2 * edge)
  path.rect(x + width - edge, y + edge, edge, height - 2 * edge)
}

/** Snap a CSS-px coordinate to a whole device pixel for crisp edges. */
function snap(cssPx: number, dpr: number): number {
  return Math.round(cssPx * dpr) / dpr
}

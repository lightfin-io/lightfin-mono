import type { PlotRect } from '../chart/chart'
import type { ChartTheme } from '../chart/options'
import type { ColumnStore } from '../data/store'
import type { PriceScale } from '../scales/priceScale'
import type { TimeScale } from '../scales/timeScale'
import type { IndexWindow } from './series'

/**
 * Candlestick renderer (PLAN §5 layer 2, §9 batching rules).
 *
 * Walks the visible window once, buckets bars into up vs down, accumulates
 * every up body *and* wick as `rect()` subpaths in a single path, sets
 * `fillStyle` once, and `fill()`s once — then the same for down. That's ~2
 * fills for the whole series regardless of candle count, versus the
 * per-candle `fillStyle=…; fillRect(); stroke()` anti-pattern. The caller
 * clips to `plot`.
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
): void {
  const h = plot.height
  // 1 device-pixel wick, expressed in CSS px so it stays crisp at any dpr.
  const wickW = 1 / dpr
  // Body fills ~80% of the slot, leaving a gap between candles; never wider
  // than the slot and at least the wick width so thin candles stay visible.
  const bodyW = Math.max(wickW, timeScale.barWidth * 0.8)
  const halfBody = bodyW / 2

  const up = new Path2D()
  const down = new Path2D()

  for (let i = window.from; i <= window.to; i++) {
    const p = store.physical(i)
    const open = store.opens[p]!
    const close = store.closes[p]!
    const high = store.highs[p]!
    const low = store.lows[p]!

    const cx = plot.left + timeScale.indexToX(i)
    const path = close >= open ? up : down

    // Wick: high → low, 1 device-px wide, snapped to a device-pixel column.
    const wickX = snap(cx - wickW / 2, dpr)
    const yHigh = priceScale.priceToY(high, h) + plot.top
    const yLow = priceScale.priceToY(low, h) + plot.top
    path.rect(wickX, yHigh, wickW, Math.max(wickW, yLow - yHigh))

    // Body: open ↔ close, min 1px tall so dojis remain visible.
    const yOpen = priceScale.priceToY(open, h) + plot.top
    const yClose = priceScale.priceToY(close, h) + plot.top
    const bodyTop = Math.min(yOpen, yClose)
    const bodyX = snap(cx - halfBody, dpr)
    path.rect(bodyX, bodyTop, bodyW, Math.max(1, Math.abs(yClose - yOpen)))
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

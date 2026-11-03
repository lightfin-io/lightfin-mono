import type { PlotRect } from '../chart/chart.ts'
import type { ChartTheme } from '../chart/options.ts'
import { ColumnStore, type PushResult } from '../data/store.ts'
import type { Bar } from '../data/types.ts'
import type { PriceScale } from '../scales/priceScale.ts'
import type { TimeScale } from '../scales/timeScale.ts'

/** Inclusive integer index window actually on screen. Empty when from > to. */
export interface IndexWindow {
  from: number
  to: number
}

/**
 * Candlestick series (PLAN §5 layer 2, §9 batching rules).
 *
 * Owns a {@link ColumnStore} and draws it with the batched-path technique:
 * walk the visible range once, bucket bars into up vs down, accumulate every
 * up body *and* wick as `rect()` subpaths in a single path, set `fillStyle`
 * once, and `fill()` once — then the same for down. That's ~2 fills for the
 * whole series regardless of candle count, versus the per-candle
 * `fillStyle=…; fillRect(); stroke()` anti-pattern.
 */
export class CandlestickSeries {
  readonly store = new ColumnStore()

  /**
   * Set by the chart when the series is added, so `setData`/`update` can
   * trigger a repaint. `reset` is true for a full data replacement (the chart
   * refits the viewport), false for a live push.
   */
  onChange?: (reset: boolean) => void

  setData(bars: readonly Bar[]): void {
    this.store.setData(bars)
    this.onChange?.(true)
  }

  update(bar: Bar): PushResult {
    const result = this.store.push(bar)
    this.onChange?.(false)
    return result
  }

  /**
   * Inclusive integer index window visible in a plot of `width` px, clamped to
   * the stored data. Returns `from > to` when nothing is in view.
   */
  visibleWindow(timeScale: TimeScale, width: number): IndexWindow {
    const { store } = this
    if (store.size === 0) return { from: 0, to: -1 }
    const range = timeScale.visibleRange(width)
    const from = Math.max(store.firstIndex, Math.floor(range.from))
    const to = Math.min(store.lastIndex, Math.ceil(range.to))
    return { from, to }
  }

  /**
   * Min low / max high across an inclusive index window, for price-axis
   * autoscale. Returns null when the window is empty.
   */
  priceRange(window: IndexWindow): { low: number; high: number } | null {
    const { store } = this
    if (window.from > window.to || store.size === 0) return null
    let low = Infinity
    let high = -Infinity
    for (let i = window.from; i <= window.to; i++) {
      const p = store.physical(i)
      const l = store.lows[p]!
      const h = store.highs[p]!
      if (l < low) low = l
      if (h > high) high = h
    }
    return low <= high ? { low, high } : null
  }

  /**
   * Max volume across an inclusive index window, for the hidden volume scale
   * (PLAN §7). Returns 0 when the window is empty or no bar carries volume.
   */
  volumeMax(window: IndexWindow): number {
    const { store } = this
    if (window.from > window.to || !store.hasVolumeData) return 0
    let max = 0
    for (let i = window.from; i <= window.to; i++) {
      const v = store.volumes[store.physical(i)]!
      if (!Number.isNaN(v) && v > max) max = v
    }
    return max
  }

  draw(
    ctx: CanvasRenderingContext2D,
    timeScale: TimeScale,
    priceScale: PriceScale,
    plot: PlotRect,
    theme: ChartTheme,
    dpr: number,
  ): void {
    const { store } = this
    const window = this.visibleWindow(timeScale, plot.width)
    if (window.from > window.to) return

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

    // Clip to the plot rect: the rightmost/leftmost visible candle can be
    // partially in view, and its wick/body must not bleed into the axis strips.
    ctx.save()
    ctx.beginPath()
    ctx.rect(plot.left, plot.top, plot.width, plot.height)
    ctx.clip()
    ctx.fillStyle = theme.upColor
    ctx.fill(up)
    ctx.fillStyle = theme.downColor
    ctx.fill(down)
    ctx.restore()
  }
}

/** Snap a CSS-px coordinate to a whole device pixel for crisp edges (PLAN §9). */
function snap(cssPx: number, dpr: number): number {
  return Math.round(cssPx * dpr) / dpr
}

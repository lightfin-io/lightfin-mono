import type { PlotRect } from '../chart/chart'
import type { ChartTheme } from '../chart/options'
import { ColumnStore, type PushResult } from '../data/store'
import type { Bar } from '../data/types'
import type { PriceScale } from '../scales/priceScale'
import type { TimeScale } from '../scales/timeScale'
import { drawOhlcBars } from './bar'
import { drawCandles } from './candlestick'
import { drawArea, drawLine } from './line'

/** Inclusive integer index window actually on screen. Empty when from > to. */
export interface IndexWindow {
  from: number
  to: number
}

/**
 * How the series renders its bars (PLAN §5 Phase 5). All four read the same
 * OHLC store, so switching is a repaint, never a data reload:
 *   - `candlestick` — filled bodies + wicks (default).
 *   - `bar`         — OHLC bars: high–low stem, open tick left, close tick right.
 *   - `line`        — a polyline through the closes.
 *   - `area`        — the close line with a gradient fill that fades out above the volume band.
 */
export type ChartType = 'candlestick' | 'bar' | 'line' | 'area'

/**
 * How a series changed, so the chart can respond appropriately:
 *   - `reset`   — full replacement via `setData`; the chart refits the viewport.
 *   - `new-bar` — `update` appended a newer bar; the chart advances the viewport
 *                 when it's following the live edge (PLAN §8.3 follow-mode).
 *   - `tick`    — `update` mutated the last bar in place; only a repaint is
 *                 needed, the scroll bounds are unchanged.
 *   - `prepend` — older bars were backfilled at the front; logical indices stay
 *                 bound to their bars (PLAN §6), so the view holds still and
 *                 only a repaint is needed.
 *   - `style`   — `setChartType` switched the renderer; the data is untouched,
 *                 so indicators keep their caches and only a repaint (with a
 *                 fresh autoscale) is needed.
 */
export type SeriesChange = 'reset' | 'new-bar' | 'tick' | 'prepend' | 'style'

/**
 * The chart's price series. Owns a {@link ColumnStore} and draws it as
 * candlesticks, OHLC bars, a line, or an area depending on {@link chartType}.
 * Every renderer follows the PLAN §9 batching rule — a handful of fills/strokes
 * for the whole visible window regardless of bar count.
 */
export class Series {
  readonly store = new ColumnStore()
  private type: ChartType

  /**
   * Set by the chart when the series is added, so `setData`/`update` can
   * trigger the right repaint/viewport response (see {@link SeriesChange}).
   */
  onChange?: (change: SeriesChange) => void

  constructor(chartType: ChartType = 'candlestick') {
    this.type = chartType
  }

  get chartType(): ChartType {
    return this.type
  }

  /** Switch how the existing data renders; a no-op when already of `type`. */
  setChartType(type: ChartType): void {
    if (type === this.type) return
    this.type = type
    this.onChange?.('style')
  }

  setData(bars: readonly Bar[]): void {
    this.store.setData(bars)
    this.onChange?.('reset')
  }

  update(bar: Bar): PushResult {
    const result = this.store.push(bar)
    this.onChange?.(result.isNewBar ? 'new-bar' : 'tick')
    return result
  }

  /** Backfill older bars at the front (history), e.g. from a {@link DataSource}. */
  prepend(bars: readonly Bar[]): void {
    if (bars.length === 0) return
    this.store.prepend(bars)
    this.onChange?.('prepend')
  }

  /** Whether the series draws only closes (line/area), not the full OHLC range. */
  get closeOnly(): boolean {
    return this.type === 'line' || this.type === 'area'
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
   * Price extent across an inclusive index window, for price-axis autoscale:
   * min low / max high for candles and bars, min/max close for line and area
   * (which never draw the wicks). Returns null when the window is empty.
   */
  priceRange(window: IndexWindow): { low: number; high: number } | null {
    const { store } = this
    if (window.from > window.to || store.size === 0) return null
    const lows = this.closeOnly ? store.closes : store.lows
    const highs = this.closeOnly ? store.closes : store.highs
    let low = Infinity
    let high = -Infinity
    for (let i = window.from; i <= window.to; i++) {
      const p = store.physical(i)
      const l = lows[p]!
      const h = highs[p]!
      if (l < low) low = l
      if (h > high) high = h
    }
    return low <= high ? { low, high } : null
  }

  /**
   * The price of bar `index` nearest to `price` — the closest of its
   * open/high/low/close, or its close for line/area — for the crosshair's
   * magnet mode (PLAN §8.2).
   */
  snapPrice(index: number, price: number): number {
    const { store } = this
    if (!store.has(index)) return price
    const p = store.physical(index)
    if (this.closeOnly) return store.closes[p]!
    let best = store.opens[p]!
    for (const v of [store.highs[p]!, store.lows[p]!, store.closes[p]!]) {
      if (Math.abs(v - price) < Math.abs(best - price)) best = v
    }
    return best
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
    const window = this.visibleWindow(timeScale, plot.width)
    if (window.from > window.to) return

    // Clip to the plot rect: the rightmost/leftmost visible bar can be
    // partially in view and must not bleed into the axis strips.
    ctx.save()
    ctx.beginPath()
    ctx.rect(plot.left, plot.top, plot.width, plot.height)
    ctx.clip()
    const args = [ctx, this.store, window, timeScale, priceScale, plot] as const
    switch (this.type) {
      case 'candlestick':
        drawCandles(...args, theme, dpr)
        break
      case 'bar':
        drawOhlcBars(...args, theme, dpr)
        break
      case 'line':
        drawLine(...args, theme)
        break
      case 'area':
        drawArea(...args, theme)
        break
    }
    ctx.restore()
  }
}

import type { PlotRect } from '../chart/chart'
import type { ChartTheme } from '../chart/options'
import { ColumnStore, type PushResult } from '../data/store'
import type { Bar, UTCTimestamp } from '../data/types'
import type { PriceScale } from '../scales/priceScale'
import type { TimeScale } from '../scales/timeScale'
import { drawOhlcBars } from './bar'
import { drawCandles } from './candlestick'
import { drawColumns } from './columns'
import { heikinAshiClose } from './heikinAshi'
import { drawArea, drawBaseline, drawHlcArea, drawLine } from './line'

/** Inclusive integer index window actually on screen. Empty when from > to. */
export interface IndexWindow {
  from: number
  to: number
}

/** Price renderers that share the same OHLCV data and time slots. */
export type ChartType =
  | 'candlestick'
  | 'hollowCandles'
  | 'volumeCandles'
  | 'bar'
  | 'highLow'
  | 'heikinAshi'
  | 'line'
  | 'lineWithMarkers'
  | 'stepLine'
  | 'area'
  | 'hlcArea'
  | 'baseline'
  | 'columns'

/**
 * How a series changed, so the chart can respond appropriately:
 *   - `reset`   — full replacement via `setData`; the chart refits the viewport.
 *   - `new-bar` — `update` appended a newer bar; the chart advances the viewport
 *                 when it's following the live edge.
 *   - `tick`    — `update` mutated the last bar in place; only a repaint is
 *                 needed, the scroll bounds are unchanged.
 *   - `prepend` — older bars were backfilled at the front; logical indices stay
 *                 bound to their bars, so the view holds still and
 *                 only a repaint is needed.
 *   - `style`   — `setChartType` switched the renderer; the data is untouched,
 *                 so indicators keep their caches and only a repaint (with a
 *                 fresh autoscale) is needed.
 */
export type SeriesChange = 'reset' | 'new-bar' | 'tick' | 'prepend' | 'style'

/**
 * The chart's price series. Owns a {@link ColumnStore} and draws it according
 * to {@link chartType}, batching fills and strokes across the visible window.
 */
export class Series {
  readonly store = new ColumnStore()
  private type: ChartType
  // Only the Heikin Ashi open is recursive. Cache it by offset from the
  // oldest bar so panning is cheap and live updates only compute the tail.
  private heikinOpens: number[] = []

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
    this.rebuildHeikinOpens()
    this.onChange?.('style')
  }

  setData(bars: readonly Bar[]): void {
    this.store.setData(bars)
    if (this.type === 'heikinAshi') this.rebuildHeikinOpens()
    this.onChange?.('reset')
  }

  update(bar: Bar): PushResult {
    const result = this.store.push(bar)
    if (this.type === 'heikinAshi') this.updateHeikinOpen(result.index)
    this.onChange?.(result.isNewBar ? 'new-bar' : 'tick')
    return result
  }

  /**
   * Copies of the loaded bars with `from <= time <= to`, oldest first; omit
   * a bound to run to that end of the data. Pair with
   * `chart.visibleTimeRange()` to read what's on screen.
   */
  bars(range: { from?: UTCTimestamp; to?: UTCTimestamp } = {}): Bar[] {
    const { store } = this
    if (store.size === 0) return []
    let from = store.firstIndex
    if (range.from !== undefined) {
      from = store.indexAtOrBefore(range.from)
      if (!store.has(from) || store.times[store.physical(from)]! < range.from) {
        from++
      }
    }
    const to =
      range.to === undefined ? store.lastIndex : store.indexAtOrBefore(range.to)
    const out: Bar[] = []
    for (let i = from; i <= to; i++) out.push(store.get(i))
    return out
  }

  /** Backfill older bars at the front (history), e.g. from a {@link DataSource}. */
  prepend(bars: readonly Bar[]): void {
    if (bars.length === 0) return
    this.store.prepend(bars)
    if (this.type === 'heikinAshi') this.rebuildHeikinOpens()
    this.onChange?.('prepend')
  }

  private rebuildHeikinOpens(): void {
    this.heikinOpens = []
    if (this.type !== 'heikinAshi' || this.store.size === 0) return
    for (let i = this.store.firstIndex; i <= this.store.lastIndex; i++) {
      this.updateHeikinOpen(i)
    }
  }

  private updateHeikinOpen(index: number): void {
    const { store, heikinOpens } = this
    const offset = index - store.firstIndex
    const p = store.physical(index)
    heikinOpens[offset] =
      offset === 0
        ? (store.opens[p]! + store.closes[p]!) / 2
        : (heikinOpens[offset - 1]! + heikinAshiClose(store, p - 1)) / 2
  }

  /** Close plotted at a loaded bar index, including Heikin Ashi smoothing. */
  plottedClose(index: number): number {
    const p = this.store.physical(index)
    return this.type === 'heikinAshi'
      ? heikinAshiClose(this.store, p)
      : this.store.closes[p]!
  }

  /** Whether the series plots a single price (the close) per bar. */
  get closeOnly(): boolean {
    return (
      this.type === 'line' ||
      this.type === 'lineWithMarkers' ||
      this.type === 'stepLine' ||
      this.type === 'area' ||
      this.type === 'baseline' ||
      this.type === 'columns'
    )
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

  /** Plotted price extent across an inclusive window, or null when empty. */
  priceRange(window: IndexWindow): { low: number; high: number } | null {
    const { store } = this
    if (window.from > window.to || store.size === 0) return null
    const lows = this.closeOnly ? store.closes : store.lows
    const highs = this.closeOnly ? store.closes : store.highs
    let low = this.type === 'columns' ? 0 : Infinity
    let high = this.type === 'columns' ? 0 : -Infinity
    const opens = this.type === 'heikinAshi' ? this.heikinOpens : undefined
    for (let i = window.from; i <= window.to; i++) {
      const p = store.physical(i)
      const open = opens?.[i - store.firstIndex]
      let l = lows[p]!
      let h = highs[p]!
      if (open !== undefined) {
        const close = heikinAshiClose(store, p)
        l = Math.min(l, open, close)
        h = Math.max(h, open, close)
      }
      if (l < low) low = l
      if (h > high) high = h
    }
    return low <= high ? { low, high } : null
  }

  /** Nearest price plotted at a bar, for the crosshair's magnet mode. */
  snapPrice(index: number, price: number): number {
    const { store } = this
    if (store.size === 0 || !store.has(index)) return price
    const p = store.physical(index)
    const close = this.plottedClose(index)
    if (this.closeOnly) return close
    const heikinOpen = this.heikinOpens[index - store.firstIndex]
    const open = heikinOpen ?? store.opens[p]!
    const high =
      heikinOpen === undefined
        ? store.highs[p]!
        : Math.max(store.highs[p]!, open, close)
    const low =
      heikinOpen === undefined
        ? store.lows[p]!
        : Math.min(store.lows[p]!, open, close)
    const prices =
      this.type === 'highLow'
        ? [high, low]
        : this.type === 'hlcArea'
          ? [close, high, low]
          : [open, high, low, close]
    let best = prices[0]!
    for (const v of prices) {
      if (Math.abs(v - price) < Math.abs(best - price)) best = v
    }
    return best
  }

  /**
   * Max volume across an inclusive index window, for the hidden volume scale.
   * Returns 0 when the window is empty or no bar carries volume.
   */
  volumeMax(window: IndexWindow): number {
    const { store } = this
    if (window.from > window.to || !store.hasVolumeData) return 0
    let max = 0
    for (let i = window.from; i <= window.to; i++) {
      const v = store.volumes[store.physical(i)]!
      if (Number.isFinite(v) && v > max) max = v
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
    baselinePrice?: number,
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
      case 'hollowCandles':
      case 'volumeCandles':
      case 'heikinAshi':
      case 'highLow':
        drawCandles(
          ...args,
          theme,
          dpr,
          this.type,
          this.heikinOpens,
          this.type === 'volumeCandles' ? this.volumeMax(window) : 0,
        )
        break
      case 'bar':
        drawOhlcBars(...args, theme, dpr)
        break
      case 'line':
      case 'lineWithMarkers':
      case 'stepLine':
        drawLine(...args, theme, this.type)
        break
      case 'area':
        drawArea(...args, theme)
        break
      case 'hlcArea':
        drawHlcArea(...args, theme)
        break
      case 'baseline':
        drawBaseline(...args, theme, baselinePrice)
        break
      case 'columns':
        drawColumns(...args, theme, dpr)
        break
    }
    ctx.restore()
  }
}

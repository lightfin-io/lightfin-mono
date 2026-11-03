import { CrosshairController } from '../interaction/crosshair.ts'
import { PanZoomController } from '../interaction/panzoom.ts'
import { LayerManager } from '../render/layers.ts'
import { FrameScheduler } from '../render/scheduler.ts'
import { PriceScale } from '../scales/priceScale.ts'
import { priceTicks, stepDecimals } from '../scales/ticks.ts'
import { TimeScale } from '../scales/timeScale.ts'
import { timeAxisLabels } from '../scales/timeTicks.ts'
import { CandlestickSeries } from '../series/candlestick.ts'
import { drawVolume } from '../series/volume.ts'
import type { ChartOptions, ChartOptionsInput } from './options.ts'
import { resolveOptions } from './options.ts'

/**
 * The plot area (the candle region) in CSS pixels, excluding the axis strips.
 */
export interface PlotRect {
  left: number
  top: number
  width: number
  height: number
}

const MIN_BAR_WIDTH = 0.5
const MAX_BAR_WIDTH = 200
const PRICE_LABEL_SPACING = 48
const TIME_LABEL_SPACING = 90
// Fraction of the volume region the price domain is lifted above. <1 so candles
// still dip slightly into the (translucent) volume bars, TradingView-style,
// rather than sitting entirely clear of them.
const VOLUME_PRICE_MARGIN = 0.6

/**
 * The root chart object (PLAN §4 `chart/`). Owns the layered canvas stack, the
 * frame scheduler, the time/price scales, the pan/zoom controller, and the
 * series. Phase 1 supports a single candlestick series with an index-based time
 * axis, autoscaled price axis, and anchored pan/zoom over static data.
 */
export class Chart {
  private readonly container: HTMLElement
  private readonly options: ChartOptions
  private readonly layers: LayerManager
  private readonly scheduler: FrameScheduler
  private readonly resizeObserver: ResizeObserver
  private readonly panzoom: PanZoomController
  private readonly crosshair: CrosshairController
  private crosshairPoint: { x: number; y: number } | null = null

  private readonly timeScaleModel = new TimeScale()
  private readonly priceScale = new PriceScale()
  private series: CandlestickSeries | null = null

  constructor(container: HTMLElement, options: ChartOptionsInput = {}) {
    this.container = container
    this.options = resolveOptions(options)
    this.layers = new LayerManager(container)
    this.scheduler = new FrameScheduler(dirty => this.paint(dirty))

    this.panzoom = new PanZoomController(this.layers.root, {
      onPan: dx => this.onPan(dx),
      onZoom: (factor, anchorX) => this.onZoom(factor, anchorX),
    })
    this.crosshair = new CrosshairController(this.layers.root, {
      onMove: point => this.onCrosshairMove(point),
    })

    this.resizeObserver = new ResizeObserver(() => this.syncSize())
    this.resizeObserver.observe(container)
    this.syncSize()
  }

  /** Add the chart's candlestick series. Phase 1 supports one. */
  addCandlestickSeries(): CandlestickSeries {
    const series = new CandlestickSeries()
    series.onChange = reset => {
      if (reset) this.fitContent()
      else this.invalidateViewport()
    }
    this.series = series
    return series
  }

  /** The time scale, for programmatic pan/zoom (PLAN §11). */
  timeScale(): TimeScale {
    return this.timeScaleModel
  }

  /** Current plot rect (candle region), excluding axis strips. */
  plotRect(): PlotRect {
    const { width, height } = this.layers.getSize()
    const { priceAxisWidth, timeAxisHeight } = this.options
    return {
      left: 0,
      top: 0,
      width: Math.max(0, width - priceAxisWidth),
      height: Math.max(0, height - timeAxisHeight),
    }
  }

  /** Fit all data into view, with `rightOffset` bars of empty space at the right. */
  fitContent(): void {
    const store = this.series?.store
    if (!store || store.size === 0) return
    const plot = this.plotRect()
    if (plot.width <= 0) return
    const slots = store.size + this.options.rightOffset
    this.timeScaleModel.barWidth = clamp(
      plot.width / slots,
      MIN_BAR_WIDTH,
      MAX_BAR_WIDTH,
    )
    // Bar `scrollIndex` has its left edge at x=0; left-align the oldest bar.
    this.timeScaleModel.scrollIndex = store.firstIndex
    this.invalidateViewport()
  }

  private onPan(dx: number): void {
    this.timeScaleModel.panByPixels(dx)
    this.clampScroll()
    this.invalidateViewport()
  }

  private onZoom(factor: number, anchorX: number): void {
    const ts = this.timeScaleModel
    const next = clamp(ts.barWidth * factor, MIN_BAR_WIDTH, MAX_BAR_WIDTH)
    ts.zoom(next / ts.barWidth, anchorX)
    this.clampScroll()
    this.invalidateViewport()
  }

  /** Keep data on screen with at most `rightOffset` empty slots at the edges. */
  private clampScroll(): void {
    const store = this.series?.store
    if (!store || store.size === 0) return
    const ts = this.timeScaleModel
    const plot = this.plotRect()
    const viewBars = plot.width / ts.barWidth
    const maxScroll = store.lastIndex + 1 + this.options.rightOffset - viewBars
    const minScroll = store.firstIndex
    ts.scrollIndex =
      maxScroll < minScroll
        ? maxScroll
        : clamp(ts.scrollIndex, minScroll, maxScroll)
  }

  /** Mark the viewport-dependent layers dirty (data or pan/zoom changed). */
  private invalidateViewport(): void {
    this.scheduler.invalidate('background', 'series', 'axes', 'overlay')
  }

  private onCrosshairMove(point: { x: number; y: number } | null): void {
    this.crosshairPoint = point
    this.scheduler.invalidate('overlay')
  }

  /** Match the container size and device pixel ratio, repainting if changed. */
  private syncSize(): void {
    const width = this.container.clientWidth
    const height = this.container.clientHeight
    const dpr = window.devicePixelRatio || 1
    if (this.layers.resize({ width, height }, dpr)) {
      this.panzoom.refreshRect()
      this.crosshair.refreshRect()
      this.clampScroll()
      this.scheduler.invalidate('background', 'series', 'overlay', 'axes')
    }
  }

  private paint(dirty: ReadonlySet<string>): void {
    // Autoscale the price axis to what's visible before drawing dependents.
    if (dirty.has('background') || dirty.has('series') || dirty.has('axes')) {
      this.autoScalePrice()
    }
    if (dirty.has('background')) this.paintBackground()
    if (dirty.has('series')) this.paintSeries()
    if (dirty.has('axes')) this.paintAxes()
    if (dirty.has('overlay')) this.paintOverlay()
  }

  private autoScalePrice(): void {
    if (!this.series) return
    // Lift the price domain clear of the volume histogram's bottom slice so
    // candles don't draw over it (PLAN §7).
    this.priceScale.bottomMargin =
      this.options.volumeVisible && this.series.store.hasVolumeData
        ? this.options.volumeHeightRatio * VOLUME_PRICE_MARGIN
        : 0
    const plot = this.plotRect()
    const window = this.series.visibleWindow(this.timeScaleModel, plot.width)
    const range = this.series.priceRange(window)
    if (range) this.priceScale.autoScale(range.low, range.high)
  }

  private paintBackground(): void {
    const ctx = this.layers.getContext('background')
    const { width, height } = this.layers.getSize()
    const { theme } = this.options
    const plot = this.plotRect()
    const dpr = this.layers.getDpr()

    this.layers.clear('background')
    ctx.fillStyle = theme.background
    ctx.fillRect(0, 0, width, height)

    ctx.strokeStyle = theme.gridColor
    ctx.lineWidth = 1
    ctx.beginPath()

    // Horizontal gridlines at price ticks.
    const ticks = this.visiblePriceTicks(plot.height)
    for (const price of ticks) {
      const y = snap(this.priceScale.priceToY(price, plot.height), dpr)
      ctx.moveTo(0, y)
      ctx.lineTo(plot.width, y)
    }

    // Vertical gridlines at time labels.
    for (const { x } of this.timeTicks(plot)) {
      const sx = snap(x, dpr)
      ctx.moveTo(sx, 0)
      ctx.lineTo(sx, plot.height)
    }
    ctx.stroke()
  }

  private paintSeries(): void {
    if (!this.series) return
    this.layers.clear('series')
    const ctx = this.layers.getContext('series')
    const plot = this.plotRect()
    const dpr = this.layers.getDpr()

    // Volume first so the candles draw on top of its (semi-transparent) bars.
    if (this.options.volumeVisible && this.series.store.hasVolumeData) {
      const window = this.series.visibleWindow(this.timeScaleModel, plot.width)
      drawVolume(
        ctx,
        this.series.store,
        window,
        this.timeScaleModel,
        plot,
        {
          max: this.series.volumeMax(window),
          heightRatio: this.options.volumeHeightRatio,
          upColor: this.options.theme.volumeUpColor,
          downColor: this.options.theme.volumeDownColor,
        },
        dpr,
      )
    }

    this.series.draw(
      ctx,
      this.timeScaleModel,
      this.priceScale,
      plot,
      this.options.theme,
      dpr,
    )
  }

  private paintAxes(): void {
    const ctx = this.layers.getContext('axes')
    const { width } = this.layers.getSize()
    const { theme } = this.options
    const plot = this.plotRect()
    const dpr = this.layers.getDpr()

    this.layers.clear('axes')
    ctx.font = `${theme.fontSize}px ${theme.fontFamily}`
    ctx.textBaseline = 'middle'

    // Price axis strip (right).
    ctx.strokeStyle = theme.axisBorderColor
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(snap(plot.width, dpr), 0)
    ctx.lineTo(snap(plot.width, dpr), plot.height)
    ctx.stroke()

    ctx.fillStyle = theme.axisTextColor
    ctx.textAlign = 'left'
    const ticks = this.visiblePriceTicks(plot.height)
    for (const price of ticks) {
      const y = this.priceScale.priceToY(price, plot.height)
      if (y < 0 || y > plot.height) continue
      ctx.fillText(formatPrice(price, ticks, this.options), plot.width + 6, y)
    }

    // Time axis strip (bottom).
    ctx.beginPath()
    ctx.moveTo(0, snap(plot.height, dpr))
    ctx.lineTo(width, snap(plot.height, dpr))
    ctx.stroke()

    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    for (const { x, text } of this.timeTicks(plot)) {
      if (x < 0 || x > plot.width) continue
      ctx.fillText(text, x, plot.height + 6)
    }
  }

  /** "Nice" price-axis tick values for the current price scale and plot height. */
  private visiblePriceTicks(plotHeight: number): number[] {
    const count = Math.max(2, Math.floor(plotHeight / PRICE_LABEL_SPACING))
    return priceTicks(this.priceScale.min, this.priceScale.max, count)
  }

  /**
   * Overlay layer (PLAN §5 layers 3–4): the always-on current-price line plus
   * the pointer-following crosshair. Cheap by construction — redrawn on every
   * pointer move and every live tick without touching the series layer.
   */
  private paintOverlay(): void {
    this.layers.clear('overlay')
    const store = this.series?.store
    if (!store || store.size === 0) return

    const plot = this.plotRect()
    if (this.options.priceLineVisible) this.paintPriceLine(plot)
    if (this.crosshairPoint) this.paintCrosshair(this.crosshairPoint, plot)
  }

  /**
   * Dotted horizontal line + filled price-axis badge at the last bar's close
   * (PLAN §8.3), colored by the last candle's direction like TradingView. Drawn
   * only when that price sits within the autoscaled visible range.
   */
  private paintPriceLine(plot: PlotRect): void {
    const store = this.series!.store
    const { width, height } = this.layers.getSize()
    const { theme } = this.options
    const dpr = this.layers.getDpr()

    const p = store.physical(store.lastIndex)
    const close = store.closes[p]!
    const up = close >= store.opens[p]!
    const y = this.priceScale.priceToY(close, plot.height)
    if (y < 0 || y > plot.height) return

    const color = up ? theme.upColor : theme.downColor
    const ctx = this.layers.getContext('overlay')
    const lineY = snap(y, dpr)

    ctx.save()
    ctx.strokeStyle = color
    ctx.lineWidth = 1
    ctx.setLineDash([4, 4])
    ctx.beginPath()
    ctx.moveTo(0, lineY)
    ctx.lineTo(plot.width, lineY)
    ctx.stroke()
    ctx.restore()

    const text = formatPrice(
      close,
      this.visiblePriceTicks(plot.height),
      this.options,
    )
    const boxH = theme.fontSize + 8
    const boxY = clamp(y - boxH / 2, 0, height - boxH)
    ctx.font = `${theme.fontSize}px ${theme.fontFamily}`
    ctx.textBaseline = 'middle'
    ctx.fillStyle = color
    ctx.fillRect(plot.width, boxY, width - plot.width, boxH)
    ctx.fillStyle = theme.background
    ctx.textAlign = 'left'
    ctx.fillText(text, plot.width + 6, boxY + boxH / 2)
  }

  /** Dotted crosshair lines + axis value labels, following the pointer (PLAN §8.2). */
  private paintCrosshair(point: { x: number; y: number }, plot: PlotRect): void {
    const store = this.series!.store
    const { width, height } = this.layers.getSize()
    const { theme } = this.options
    const ts = this.timeScaleModel
    const dpr = this.layers.getDpr()

    const nearest = clamp(
      ts.nearestIndex(point.x),
      store.firstIndex,
      store.lastIndex,
    )
    const lineX = snap(ts.indexToX(nearest), dpr)
    const clampedY = clamp(point.y, 0, plot.height)
    const lineY = snap(clampedY, dpr)

    const ctx = this.layers.getContext('overlay')
    ctx.save()
    ctx.strokeStyle = theme.crosshairColor
    ctx.lineWidth = 1
    ctx.setLineDash([4, 4])
    ctx.beginPath()
    ctx.moveTo(lineX, 0)
    ctx.lineTo(lineX, height)
    ctx.moveTo(0, lineY)
    ctx.lineTo(width, lineY)
    ctx.stroke()
    ctx.restore()

    ctx.font = `${theme.fontSize}px ${theme.fontFamily}`
    ctx.textBaseline = 'middle'
    ctx.fillStyle = theme.crosshairColor

    // Price label (right gutter), centered on the horizontal line.
    const price = this.priceScale.yToPrice(clampedY, plot.height)
    const priceText = formatPrice(
      price,
      this.visiblePriceTicks(plot.height),
      this.options,
    )
    const priceBoxH = theme.fontSize + 8
    const priceBoxY = clamp(clampedY - priceBoxH / 2, 0, height - priceBoxH)
    ctx.fillRect(plot.width, priceBoxY, width - plot.width, priceBoxH)
    ctx.fillStyle = theme.background
    ctx.textAlign = 'left'
    ctx.fillText(priceText, plot.width + 6, priceBoxY + priceBoxH / 2)

    // Time label (bottom gutter), centered on the vertical line.
    const time = store.times[store.physical(nearest)]!
    const timeText = formatCrosshairTime(time)
    const timeBoxW = ctx.measureText(timeText).width + 12
    const timeBoxX = clamp(lineX - timeBoxW / 2, 0, width - timeBoxW)
    ctx.fillStyle = theme.crosshairColor
    ctx.fillRect(timeBoxX, plot.height, timeBoxW, height - plot.height)
    ctx.fillStyle = theme.background
    ctx.textAlign = 'center'
    ctx.fillText(
      timeText,
      timeBoxX + timeBoxW / 2,
      plot.height + (height - plot.height) / 2,
    )
  }

  /**
   * Interval-aware time-axis ticks (x position + label text) for the visible
   * range — labels land on round wall-clock boundaries and skip data gaps
   * (PLAN §7). Shared by the gridlines (x only) and the axis strip (x + text).
   */
  private timeTicks(plot: PlotRect): { x: number; text: string }[] {
    const store = this.series?.store
    if (!store || store.size === 0) return []
    const ts = this.timeScaleModel
    const range = ts.visibleRange(plot.width)
    const from = Math.max(store.firstIndex, Math.floor(range.from))
    const to = Math.min(store.lastIndex, Math.ceil(range.to))

    const bars: { index: number; time: number }[] = []
    for (let i = from; i <= to; i++) {
      bars.push({ index: i, time: store.times[store.physical(i)]! })
    }
    return timeAxisLabels(bars, ts.barWidth, TIME_LABEL_SPACING).map(l => ({
      x: ts.indexToX(l.index),
      text: l.text,
    }))
  }

  /** Tear down observers, listeners, canvases, and any pending frame. */
  remove(): void {
    this.resizeObserver.disconnect()
    this.panzoom.dispose()
    this.crosshair.dispose()
    this.scheduler.dispose()
    this.layers.dispose()
  }
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value
}

/** Snap a CSS-px coordinate to a whole device pixel for crisp 1px lines. */
function snap(cssPx: number, dpr: number): number {
  return (Math.round(cssPx * dpr) + 0.5) / dpr
}

/** Decimal places implied by the spacing between adjacent price ticks. */
function priceTickDecimals(ticks: readonly number[]): number {
  return stepDecimals(ticks.length > 1 ? ticks[1]! - ticks[0]! : 1)
}

/** Formats a price for axis/crosshair labels, honoring `priceDecimals`/`priceFormatter`. */
function formatPrice(
  price: number,
  ticks: readonly number[],
  options: ChartOptions,
): string {
  const decimals = Math.max(options.priceDecimals, priceTickDecimals(ticks))
  return options.priceFormatter
    ? options.priceFormatter(price, decimals)
    : price.toFixed(decimals)
}

/**
 * Full date + time label for the crosshair's time-axis box — unlike
 * {@link formatTimeLabel}, always shows both since it has no previous label
 * to diff against.
 */
function formatCrosshairTime(timeSec: number): string {
  const d = new Date(timeSec * 1000)
  const month = d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' })
  const hh = String(d.getUTCHours()).padStart(2, '0')
  const mm = String(d.getUTCMinutes()).padStart(2, '0')
  return `${month} ${d.getUTCDate()} ${hh}:${mm}`
}

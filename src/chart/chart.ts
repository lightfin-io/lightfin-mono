import { CrosshairController } from '../interaction/crosshair.ts'
import { PanZoomController } from '../interaction/panzoom.ts'
import { LayerManager } from '../render/layers.ts'
import { FrameScheduler } from '../render/scheduler.ts'
import { PriceScale } from '../scales/priceScale.ts'
import { chooseBarStep, priceTicks, stepDecimals } from '../scales/ticks.ts'
import { TimeScale } from '../scales/timeScale.ts'
import { CandlestickSeries } from '../series/candlestick.ts'
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
    for (const { x } of this.timeLabelPositions(plot)) {
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
    this.series.draw(
      ctx,
      this.timeScaleModel,
      this.priceScale,
      this.plotRect(),
      this.options.theme,
      this.layers.getDpr(),
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
    const decimals = priceTickDecimals(ticks)
    for (const price of ticks) {
      const y = this.priceScale.priceToY(price, plot.height)
      if (y < 0 || y > plot.height) continue
      ctx.fillText(price.toFixed(decimals), plot.width + 6, y)
    }

    // Time axis strip (bottom).
    ctx.beginPath()
    ctx.moveTo(0, snap(plot.height, dpr))
    ctx.lineTo(width, snap(plot.height, dpr))
    ctx.stroke()

    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    const labels = this.timeLabelPositions(plot)
    let prevTime: number | null = null
    for (const { x, time } of labels) {
      if (x < 0 || x > plot.width) continue
      ctx.fillText(formatTimeLabel(time, prevTime), x, plot.height + 6)
      prevTime = time
    }
  }

  /** "Nice" price-axis tick values for the current price scale and plot height. */
  private visiblePriceTicks(plotHeight: number): number[] {
    const count = Math.max(2, Math.floor(plotHeight / PRICE_LABEL_SPACING))
    return priceTicks(this.priceScale.min, this.priceScale.max, count)
  }

  /** Dotted crosshair lines + axis value labels, following the pointer (PLAN §8.2). */
  private paintOverlay(): void {
    this.layers.clear('overlay')
    const point = this.crosshairPoint
    const store = this.series?.store
    if (!point || !store || store.size === 0) return

    const plot = this.plotRect()
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
    const decimals = priceTickDecimals(this.visiblePriceTicks(plot.height))
    const priceText = price.toFixed(decimals)
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

  /** x positions and timestamps of time-axis labels for the visible range. */
  private timeLabelPositions(plot: PlotRect): { x: number; time: number }[] {
    const store = this.series?.store
    if (!store || store.size === 0) return []
    const ts = this.timeScaleModel
    const step = chooseBarStep(ts.barWidth, TIME_LABEL_SPACING)
    const range = ts.visibleRange(plot.width)
    const from = Math.max(store.firstIndex, Math.floor(range.from))
    const to = Math.min(store.lastIndex, Math.ceil(range.to))

    const out: { x: number; time: number }[] = []
    // Anchor labels to multiples of `step` so they don't jitter while panning.
    const start = Math.ceil(from / step) * step
    for (let i = start; i <= to; i += step) {
      if (!store.has(i)) continue
      out.push({ x: ts.indexToX(i), time: store.times[store.physical(i)]! })
    }
    return out
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

/**
 * Phase 1 time label: show the date when the day differs from the previous
 * label, otherwise HH:MM. The interval-aware ladder is a Phase 2 concern
 * (PLAN §7, §14). UTC so rendering is deterministic for tests/screenshots.
 */
function formatTimeLabel(timeSec: number, prevSec: number | null): string {
  const d = new Date(timeSec * 1000)
  const sameDay =
    prevSec !== null &&
    new Date(prevSec * 1000).getUTCDate() === d.getUTCDate() &&
    new Date(prevSec * 1000).getUTCMonth() === d.getUTCMonth()
  if (!sameDay) {
    const month = d.toLocaleString('en-US', {
      month: 'short',
      timeZone: 'UTC',
    })
    return `${month} ${d.getUTCDate()}`
  }
  const hh = String(d.getUTCHours()).padStart(2, '0')
  const mm = String(d.getUTCMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}

/** Decimal places implied by the spacing between adjacent price ticks. */
function priceTickDecimals(ticks: readonly number[]): number {
  return stepDecimals(ticks.length > 1 ? ticks[1]! - ticks[0]! : 1)
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

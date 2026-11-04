import { StoreReader } from '../data/barReader'
import type { DataSource } from '../data/dataSource'
import type { InstrumentInfo, UTCTimestamp } from '../data/types'
import type {
  IndicatorDefinition,
  IndicatorHandle,
  IndicatorModule,
} from '../indicators/types'
import { CrosshairController } from '../interaction/crosshair'
import type { ButtonRect, OrderIntentEvent } from '../interaction/orderIntent'
import { hitsButton, orderButtonRect } from '../interaction/orderIntent'
import { PanZoomController } from '../interaction/panzoom'
import { LayerManager } from '../render/layers'
import { FrameScheduler } from '../render/scheduler'
import { PriceScale } from '../scales/priceScale'
import { priceTicks, stepDecimals } from '../scales/ticks'
import { TimeScale } from '../scales/timeScale'
import { timeAxisLabels } from '../scales/timeTicks'
import { toZoned } from '../scales/timezone'
import { Series } from '../series/series'
import type { ChartType, IndexWindow, SeriesChange } from '../series/series'
import { drawVolume } from '../series/volume'
import { Emitter } from './events'
import { IndicatorController, IndicatorInstance } from './indicators'
import type { ChartOptions, ChartOptionsInput, CrosshairMode } from './options'
import { resolveOptions } from './options'

/**
 * Any indicator definition/module, regardless of its option shape. The core
 * treats options opaquely (the Options generic is erased to `any`): it merges
 * caller options over the definition's defaults and hands them back to the
 * definition, which owns their meaning.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyIndicatorSource = IndicatorModule<any> | IndicatorDefinition<any>

/**
 * The plot area (the candle region) in CSS pixels, excluding the axis strips.
 */
export interface PlotRect {
  left: number
  top: number
  width: number
  height: number
}

/** The bar under the crosshair, emitted as `crosshairMove` (null when it leaves). */
export interface CrosshairMoveEvent {
  /** Logical index of the hovered bar, clamped to the data. */
  index: number
  time: UTCTimestamp
  /** Pointer position in CSS px relative to the chart element. */
  point: { x: number; y: number }
}

/** Where each pane sits, in CSS px relative to the chart element. */
export interface PaneLayout {
  main: PlotRect
  /** Indicator sub-panes, top to bottom. */
  panes: { indicator: IndicatorHandle; rect: PlotRect }[]
}

/** Payloads of the events {@link Chart.on} can subscribe to. */
export interface ChartEventMap {
  crosshairMove: CrosshairMoveEvent | null
  /** The price series' data or chart type changed (see {@link SeriesChange}). */
  dataChange: SeriesChange
  /** A new price series replaced the previous one. */
  seriesChange: Series
  /** An indicator was added, removed, shown/hidden, or reconfigured. */
  indicatorsChange: void
  /** The chart resized or its panes changed, so {@link Chart.paneLayout} moved. */
  layoutChange: void
  instrumentChange: InstrumentInfo | null
}

const MIN_BAR_WIDTH = 0.5
const MAX_BAR_WIDTH = 200
const PRICE_LABEL_SPACING = 48
const TIME_LABEL_SPACING = 90
// Each indicator sub-pane's share of the plot height, and the cap on how much
// of it all sub-panes may claim together (so the main price pane stays usable).
const INDICATOR_PANE_RATIO = 0.22
const MAX_PANES_FRACTION = 0.6
// Fraction of the volume region the price domain is lifted above. <1 so candles
// still dip slightly into the (translucent) volume bars, TradingView-style,
// rather than sitting entirely clear of them.
const VOLUME_PRICE_MARGIN = 0.6

/**
 * The root chart object (PLAN §4 `chart/`). Owns the layered canvas stack, the
 * frame scheduler, the time/price scales, the pan/zoom controller, the series,
 * and the indicators. Supports one price series (candlestick, OHLC bar, line,
 * or area — switchable in place) on an index-based time axis with an
 * autoscaled price axis, anchored pan/zoom, a crosshair and live
 * data/follow-mode, plus overlay and own-pane indicators (PLAN §8.4).
 */
export class Chart {
  private readonly options: ChartOptions
  private readonly layers: LayerManager
  private readonly scheduler: FrameScheduler
  private readonly resizeObserver: ResizeObserver
  private readonly panzoom: PanZoomController
  private readonly crosshair: CrosshairController
  private crosshairPoint: { x: number; y: number } | null = null
  // Last index emitted as `crosshairMove`, to skip no-op viewport re-emits.
  private crosshairIndex: number | null = null
  // Order-intent listeners (PLAN §8.2); the "+" button shows only while there
  // is at least one.
  private readonly orderHandlers = new Set<(e: OrderIntentEvent) => void>()
  private orderHover = false
  // A pointerdown landed on the button; it fires on a pointerup there too.
  private orderPressed = false

  private readonly timeScaleModel = new TimeScale()
  private readonly priceScale = new PriceScale()
  private series: Series | null = null
  private reader: StoreReader | null = null
  private readonly indicatorCtl = new IndicatorController()
  // Public handles, keyed by the instance currently backing each (setOptions
  // swaps the instance but keeps the handle).
  private readonly handleOf = new Map<IndicatorInstance, IndicatorHandle>()
  private readonly events = new Emitter<ChartEventMap>()
  private instrumentInfo: InstrumentInfo | null = null
  // Whether the viewport is pinned to the live edge, so new bars scroll it
  // along (PLAN §8.3 follow-mode). On by default; turns off when the user pans
  // away from the right edge and back on when they return to it.
  private following = true

  // Optional pull-based adapter (PLAN §6): live subscription + history backfill.
  private dataSource: DataSource | null = null
  private unsubscribeLive: (() => void) | null = null
  // The in-flight history fetch; only one runs at a time.
  private historyRequest: Promise<void> | null = null
  // Bumped on every `reset`, so a fetch started against replaced data (e.g.
  // before an interval switch) is dropped instead of prepended.
  private dataEpoch = 0

  constructor(container: HTMLElement, options: ChartOptionsInput = {}) {
    this.options = resolveOptions(options)
    this.layers = new LayerManager(container)
    this.scheduler = new FrameScheduler(dirty => this.paint(dirty))

    this.panzoom = new PanZoomController(this.layers.root, {
      onPan: dx => this.onPan(dx),
      onZoom: (factor, anchorX) => this.onZoom(factor, anchorX),
      claim: point => this.claimOrderPress(point),
    })
    this.crosshair = new CrosshairController(this.layers.root, {
      onMove: point => this.onCrosshairMove(point),
    })
    this.layers.root.addEventListener('pointerup', this.onPointerUp)

    // Observe the chart's own element rather than the container, so chrome
    // can share the container (toolbars above/below) and the canvases still
    // track exactly the space left for them.
    this.resizeObserver = new ResizeObserver(() => this.syncSize())
    this.resizeObserver.observe(this.layers.root)
    this.syncSize()
  }

  /**
   * The chart's root element inside the container: the canvas stack and the
   * coordinate space of {@link plotRect}/{@link paneLayout}. Chrome widgets
   * overlay it.
   */
  get element(): HTMLElement {
    return this.layers.root
  }

  /** The resolved options, e.g. for chrome to match the theme. */
  getOptions(): Readonly<ChartOptions> {
    return this.options
  }

  /**
   * Subscribe to a chart event (see {@link ChartEventMap}). Returns an
   * unsubscribe function; everything is also dropped by {@link remove}.
   */
  on<K extends keyof ChartEventMap>(
    type: K,
    handler: (payload: ChartEventMap[K]) => void,
  ): () => void {
    return this.events.on(type, handler)
  }

  /** The current price series, or null before one is added. */
  getSeries(): Series | null {
    return this.series
  }

  /**
   * Describe the instrument on screen (PLAN §6): drives the HUD, renders
   * intraday axis/crosshair times in `timezone`, and sets price label
   * precision from `pricePrecision`. Pass null to clear.
   */
  setInstrument(info: InstrumentInfo | null): void {
    this.instrumentInfo = info ? { ...info } : null
    this.invalidateViewport()
    this.events.emit('instrumentChange', this.instrumentInfo)
  }

  instrument(): InstrumentInfo | null {
    return this.instrumentInfo
  }

  /**
   * Opt in to the order-intent hook (PLAN §8.2): while any handler is
   * registered, a "+" button rides the crosshair line at the price-axis edge of
   * the price pane, and clicking it calls `handler` with the price and
   * position. The chart owns only the button — the host renders its own order
   * form. Returns an unsubscribe function.
   */
  onOrderIntent(handler: (e: OrderIntentEvent) => void): () => void {
    this.orderHandlers.add(handler)
    this.scheduler.invalidate('overlay')
    return () => {
      if (this.orderHandlers.delete(handler))
        this.scheduler.invalidate('overlay')
    }
  }

  crosshairMode(): CrosshairMode {
    return this.options.crosshairMode
  }

  /** Switch between a free and a magnet (OHLC-snapping) crosshair. */
  setCrosshairMode(mode: CrosshairMode): void {
    this.options.crosshairMode = mode
    this.scheduler.invalidate('overlay')
  }

  /**
   * Format a price at the instrument's precision (falling back to
   * `priceDecimals`), through `priceFormatter` when set — the HUD's format.
   */
  formatPrice(price: number): string {
    const decimals = this.minPriceDecimals()
    return this.options.priceFormatter
      ? this.options.priceFormatter(price, decimals)
      : price.toFixed(decimals)
  }

  private minPriceDecimals(): number {
    return this.instrumentInfo?.pricePrecision ?? this.options.priceDecimals
  }

  /** The instrument's IANA timezone, or undefined for UTC. */
  private timeZone(): string | undefined {
    return this.instrumentInfo?.timezone
  }

  /** Add the chart's price series, drawn as candlesticks. */
  addCandlestickSeries(): Series {
    return this.addSeries('candlestick')
  }

  /** Add the chart's price series, drawn as OHLC bars. */
  addBarSeries(): Series {
    return this.addSeries('bar')
  }

  /** Add the chart's price series, drawn as a line through the closes. */
  addLineSeries(): Series {
    return this.addSeries('line')
  }

  /** Add the chart's price series, drawn as a gradient-filled area under the closes. */
  addAreaSeries(): Series {
    return this.addSeries('area')
  }

  /**
   * The chart holds one price series; adding another replaces it. The chart
   * type is only the starting renderer — `series.setChartType()` switches it
   * later without touching the data.
   */
  private addSeries(chartType: ChartType): Series {
    if (this.series) this.series.onChange = undefined
    const series = new Series(chartType)
    series.onChange = change => this.onSeriesChange(change)
    this.series = series
    this.reader = new StoreReader(series.store)
    this.events.emit('seriesChange', series)
    return series
  }

  /**
   * Add an indicator (PLAN §8.4). Pass a dynamically-imported module so the
   * indicator's code only loads when used (keeping the core lean, PLAN §10):
   *
   * ```ts
   * const sma = await chart.addIndicator(
   *   import('lightfin-web-chart/indicators/sma'),
   *   { period: 20 },
   * )
   * ```
   *
   * A resolved module or bare definition is accepted too. The indicator is
   * computed once against the current data and thereafter updated incrementally;
   * pan/zoom only re-slices its cache. Returns a handle for legends,
   * show/hide, reconfiguration, and removal.
   */
  async addIndicator(
    source: AnyIndicatorSource | Promise<AnyIndicatorSource>,
    options: Record<string, unknown> = {},
  ): Promise<IndicatorHandle> {
    const resolved = await source
    const def = 'default' in resolved ? resolved.default : resolved
    if (!this.reader) {
      throw new Error('lightfin: addIndicator requires a series; add one first')
    }
    const instance = new IndicatorInstance(def, options)
    this.indicatorCtl.add(instance, this.reader)
    const handle = this.createHandle(instance)
    this.handleOf.set(instance, handle)
    this.onIndicatorsChanged(!instance.overlay)
    return handle
  }

  /** Every indicator on the chart, in the order added. */
  indicators(): IndicatorHandle[] {
    return this.indicatorCtl.all().map(inst => this.handleOf.get(inst)!)
  }

  private createHandle(initial: IndicatorInstance): IndicatorHandle {
    let inst = initial
    return {
      get name() {
        return inst.def.name
      },
      get params() {
        return inst.params
      },
      get placement() {
        if (!inst.overlay) return 'pane'
        return inst.onVolumeScale ? 'volume' : 'price'
      },
      get options() {
        return inst.options
      },
      get plots() {
        return inst.plots
      },
      get visible() {
        return inst.visible
      },
      value: (plotKey, index) => inst.value(plotKey, index),
      setVisible: visible => {
        if (!this.handleOf.has(inst) || inst.visible === visible) return
        inst.visible = visible
        this.onIndicatorsChanged(false)
      },
      setOptions: options => {
        const handle = this.handleOf.get(inst)
        if (!handle || !this.reader) return
        const next = new IndicatorInstance(inst.def, {
          ...inst.options,
          ...options,
        })
        this.indicatorCtl.replace(inst, next, this.reader)
        this.handleOf.delete(inst)
        this.handleOf.set(next, handle)
        inst = next
        this.onIndicatorsChanged(false)
      },
      remove: () => {
        if (!this.handleOf.delete(inst)) return
        this.indicatorCtl.remove(inst)
        this.onIndicatorsChanged(!inst.overlay)
      },
    }
  }

  private onIndicatorsChanged(layoutChanged: boolean): void {
    this.invalidateViewport()
    this.events.emit('indicatorsChange', undefined)
    if (layoutChanged) this.events.emit('layoutChange', undefined)
  }

  private onSeriesChange(change: SeriesChange): void {
    // Keep indicator caches in step with the data (PLAN §8.4). A reset or
    // backfill shifts the index space, so recompute from scratch; a live tick or
    // new bar only needs the tail recomputed. Pan/zoom and a chart-type switch
    // never land here.
    if (this.reader && !this.indicatorCtl.isEmpty) {
      if (change === 'reset' || change === 'prepend') {
        this.indicatorCtl.recomputeAll(this.reader)
      } else if (change === 'tick' || change === 'new-bar') {
        this.indicatorCtl.updateLast(this.reader)
      }
    }

    if (change === 'reset') {
      this.dataEpoch++
      this.following = true
      this.fitContent()
      // Fresh data sits at its left edge; pull history so indicators (and the
      // left of the view) have lookback without needing a pan first.
      this.maybeBackfill()
    } else {
      // A new bar extends the right edge; follow it if we're pinned there,
      // otherwise just keep the existing view in bounds. An in-place tick
      // changes neither the bar count nor the scroll bounds, so only a
      // repaint is needed.
      if (change === 'new-bar') {
        if (this.following)
          this.timeScaleModel.scrollIndex = this.maxScrollIndex()
        else this.clampScroll()
      }
      // A `prepend` leaves logical indices (and thus the scroll position)
      // bound to the same bars, so the view holds still — just repaint the
      // wider data. A `style` change likewise keeps the view; the repaint
      // re-autoscales it.
      this.invalidateViewport()
    }
    this.events.emit('dataChange', change)
  }

  /**
   * Attach a pull-based {@link DataSource} (PLAN §6) for live ticks and/or
   * history backfill. Additive to `series.setData()`: set the initial bars
   * directly, then attach a source to stream live updates and lazily fetch
   * older bars as the user pans left. Replaces any previous source; returns a
   * detach function (also cleaned up by {@link Chart.remove}).
   */
  setDataSource(source: DataSource): () => void {
    this.detachDataSource()
    this.dataSource = source
    if (source.subscribeLive) {
      this.unsubscribeLive = source.subscribeLive(bar => {
        this.series?.update(bar)
      })
    }
    // If data is already loaded at its left edge, start pulling history now
    // (e.g. so indicators added later have lookback without a pan).
    this.maybeBackfill()
    return () => this.detachDataSource()
  }

  private detachDataSource(): void {
    this.unsubscribeLive?.()
    this.unsubscribeLive = null
    this.dataSource = null
  }

  /** The time scale, for programmatic pan/zoom (PLAN §11). */
  timeScale(): TimeScale {
    return this.timeScaleModel
  }

  /**
   * Show the bars between two times (Unix seconds UTC), e.g. for date-range
   * buttons. History older than the loaded data is fetched from the
   * {@link DataSource} first — at most as many bars as fit on screen at the
   * minimum bar width; a range wider than that shows its newest end. A range
   * ending at the newest bar keeps `rightOffset` and re-arms follow-mode.
   */
  async setVisibleTimeRange(range: {
    from: UTCTimestamp
    to: UTCTimestamp
  }): Promise<void> {
    await this.ensureHistory(range.from)
    const store = this.series?.store
    const plot = this.plotRect()
    if (!store || store.size === 0 || plot.width <= 0) return

    let fromIdx = store.indexAtOrBefore(range.from)
    if (fromIdx === -1) fromIdx = store.firstIndex
    else if (store.times[store.physical(fromIdx)]! < range.from) fromIdx++
    fromIdx = Math.min(fromIdx, store.lastIndex)
    const toIdx = Math.max(fromIdx, store.indexAtOrBefore(range.to))

    const pad = toIdx === store.lastIndex ? this.options.rightOffset : 0
    const ts = this.timeScaleModel
    ts.barWidth = clamp(
      plot.width / (toIdx - fromIdx + 1 + pad),
      MIN_BAR_WIDTH,
      MAX_BAR_WIDTH,
    )
    // Right-align `toIdx` (+ padding): equals left-aligning `fromIdx` unless
    // the bar width clamped.
    ts.scrollIndex = toIdx + 1 + pad - plot.width / ts.barWidth
    this.afterProgrammaticScroll()
  }

  /**
   * Center the view on the bar at or before `time` (Unix seconds UTC) at the
   * current zoom, fetching older history first if needed.
   */
  async scrollToTime(time: UTCTimestamp): Promise<void> {
    const halfScreen = this.plotRect().width / this.timeScaleModel.barWidth / 2
    await this.ensureHistory(time - Math.ceil(halfScreen) * this.barInterval())
    const store = this.series?.store
    const plot = this.plotRect()
    if (!store || store.size === 0 || plot.width <= 0) return
    const index = Math.max(store.firstIndex, store.indexAtOrBefore(time))
    const viewBars = plot.width / this.timeScaleModel.barWidth
    this.timeScaleModel.scrollIndex = index + 0.5 - viewBars / 2
    this.afterProgrammaticScroll()
  }

  private afterProgrammaticScroll(): void {
    this.clampScroll()
    this.syncFollowing()
    this.maybeBackfill()
    this.invalidateViewport()
  }

  /**
   * Fetch history back to `from` when it predates the loaded data, capped at
   * one screen of bars at the minimum bar width (any more could never show).
   */
  private async ensureHistory(from: number): Promise<void> {
    if (this.historyRequest) await this.historyRequest
    const store = this.series?.store
    if (!this.dataSource || !store || store.size < 2) return
    const oldest = store.times[store.physical(store.firstIndex)]!
    if (from >= oldest) return
    const interval = this.barInterval()
    const maxBars = Math.ceil(this.plotRect().width / MIN_BAR_WIDTH)
    await this.loadHistory(
      Math.max(from, oldest - maxBars * interval),
      oldest - interval,
    )
  }

  /**
   * Fetch `[from, to]` from the data source and prepend whatever predates the
   * current data. Dropped if the data was replaced meanwhile.
   */
  private loadHistory(from: number, to: number): Promise<void> {
    const source = this.dataSource!
    const epoch = this.dataEpoch
    const request = Promise.resolve(source.getBars({ from, to }))
      .then(bars => {
        const store = this.series?.store
        if (epoch !== this.dataEpoch || !store || store.size === 0) return
        const oldest = store.times[store.physical(store.firstIndex)]!
        const older = bars
          .filter(b => b.time < oldest)
          .sort((a, b) => a.time - b.time)
        if (older.length > 0) this.series!.prepend(older)
      })
      .catch(() => {
        /* host-side failure; a later pan will retry */
      })
      .finally(() => {
        if (this.historyRequest === request) this.historyRequest = null
      })
    this.historyRequest = request
    return request
  }

  /**
   * Seconds per bar: the smallest positive gap among the newest bars, so
   * weekend/overnight gaps don't inflate it. 1 with fewer than two bars.
   */
  private barInterval(): number {
    const store = this.series?.store
    if (!store || store.size < 2) return 1
    let min = Infinity
    const first = Math.max(store.firstIndex + 1, store.lastIndex - 16)
    for (let i = first; i <= store.lastIndex; i++) {
      const d =
        store.times[store.physical(i)]! - store.times[store.physical(i - 1)]!
      if (d > 0 && d < min) min = d
    }
    return Number.isFinite(min) ? min : 1
  }

  /** Where the main pane and each indicator sub-pane sit (for chrome overlays). */
  paneLayout(): PaneLayout {
    return {
      main: this.mainRect(),
      panes: this.paneSlots().map(({ instance, rect }) => ({
        indicator: this.handleOf.get(instance)!,
        rect,
      })),
    }
  }

  /**
   * Full plot rect (all panes) in CSS px, excluding the axis strips. Shared x
   * extent for every pane; the vertical space is split between the main price
   * pane and the indicator sub-panes (see {@link mainRect}/{@link paneSlots}).
   */
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

  /** Height of one indicator sub-pane given `n` of them share the plot. */
  private paneHeight(full: PlotRect, n: number): number {
    return Math.min(
      full.height * INDICATOR_PANE_RATIO,
      (full.height * MAX_PANES_FRACTION) / n,
    )
  }

  /** The main (candle) pane rect — the full plot minus any indicator sub-panes. */
  private mainRect(): PlotRect {
    const full = this.plotRect()
    const n = this.indicatorCtl.paneInstances().length
    if (n === 0) return full
    const used = this.paneHeight(full, n) * n
    return { ...full, height: full.height - used }
  }

  /** The indicator sub-panes stacked below the main pane, top to bottom. */
  private paneSlots(): { instance: IndicatorInstance; rect: PlotRect }[] {
    const full = this.plotRect()
    const insts = this.indicatorCtl.paneInstances()
    const n = insts.length
    if (n === 0) return []
    const each = this.paneHeight(full, n)
    const mainH = full.height - each * n
    return insts.map((instance, i) => ({
      instance,
      rect: {
        left: full.left,
        top: full.top + mainH + i * each,
        width: full.width,
        height: each,
      },
    }))
  }

  /**
   * Fit all data into view, with `rightOffset` bars of empty space at the
   * right. When there are more bars than fit at the minimum bar width, shows
   * the newest end.
   */
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
    // Bar `scrollIndex` has its left edge at x=0: left-align the oldest bar,
    // or right-align the newest when the width clamped at the minimum.
    this.timeScaleModel.scrollIndex = Math.max(
      store.firstIndex,
      this.maxScrollIndex(),
    )
    this.syncFollowing()
    this.invalidateViewport()
  }

  private onPan(dx: number): void {
    this.timeScaleModel.panByPixels(dx)
    this.clampScroll()
    this.syncFollowing()
    this.maybeBackfill()
    this.invalidateViewport()
  }

  private onZoom(factor: number, anchorX: number): void {
    const ts = this.timeScaleModel
    const next = clamp(ts.barWidth * factor, MIN_BAR_WIDTH, MAX_BAR_WIDTH)
    ts.zoom(next / ts.barWidth, anchorX)
    this.clampScroll()
    this.syncFollowing()
    this.maybeBackfill()
    this.invalidateViewport()
  }

  /**
   * Pull one screen of older history when the view is within a screenful of the
   * oldest bar — on pan/zoom *and* proactively on load (see
   * {@link setDataSource}), so indicators have lookback immediately instead of
   * only after a pan. One request in flight at a time; a subsequent pan
   * re-triggers if still near the edge. The fetch is a single chunk (not a
   * chain), so we don't eagerly load/compute far more history than the warmup
   * needs.
   */
  private maybeBackfill(): void {
    const store = this.series?.store
    if (!this.dataSource || this.historyRequest || !store || store.size < 2)
      return

    const plot = this.plotRect()
    const viewBars = plot.width / this.timeScaleModel.barWidth
    const from = this.timeScaleModel.visibleRange(plot.width).from
    // Prefetch when the oldest visible bar is within one screen of the data.
    if (from > store.firstIndex + viewBars) return

    const oldestTime = store.times[store.physical(store.firstIndex)]!
    const interval = this.barInterval()
    const span = Math.max(Math.ceil(viewBars), 1) * interval
    void this.loadHistory(oldestTime - span, oldestTime - interval)
  }

  /**
   * The largest `scrollIndex` that keeps data on screen, i.e. the newest bar
   * parked at the right edge with `rightOffset` empty slots beyond it.
   */
  private maxScrollIndex(): number {
    const store = this.series!.store
    const plot = this.plotRect()
    const viewBars = plot.width / this.timeScaleModel.barWidth
    return store.lastIndex + 1 + this.options.rightOffset - viewBars
  }

  /** Keep data on screen with at most `rightOffset` empty slots at the edges. */
  private clampScroll(): void {
    const store = this.series?.store
    if (!store || store.size === 0) return
    const ts = this.timeScaleModel
    const maxScroll = this.maxScrollIndex()
    const minScroll = store.firstIndex
    ts.scrollIndex =
      maxScroll < minScroll
        ? maxScroll
        : clamp(ts.scrollIndex, minScroll, maxScroll)
  }

  /**
   * After a user-driven pan/zoom, re-arm follow-mode when the view is sitting at
   * the live edge and disarm it once they scroll back into history (PLAN §8.3).
   * The half-bar tolerance keeps it armed through sub-bar fractional offsets.
   */
  private syncFollowing(): void {
    const store = this.series?.store
    if (!store || store.size === 0) return
    this.following =
      this.timeScaleModel.scrollIndex >= this.maxScrollIndex() - 0.5
  }

  /** Mark the viewport-dependent layers dirty (data or pan/zoom changed). */
  private invalidateViewport(): void {
    this.scheduler.invalidate('background', 'series', 'axes', 'overlay')
    // A wheel zoom or programmatic scroll moves bars under a still pointer.
    if (this.crosshairPoint) this.emitCrosshair(true)
  }

  private onCrosshairMove(point: { x: number; y: number } | null): void {
    this.crosshairPoint = point
    if (!point) this.orderPressed = false
    this.scheduler.invalidate('overlay')
    this.emitCrosshair(false)
  }

  private emitCrosshair(onlyIfMoved: boolean): void {
    const point = this.crosshairPoint
    const store = this.series?.store
    if (!point || !store || store.size === 0) {
      this.crosshairIndex = null
      this.events.emit('crosshairMove', null)
      return
    }
    const index = clamp(
      this.timeScaleModel.nearestIndex(point.x),
      store.firstIndex,
      store.lastIndex,
    )
    if (onlyIfMoved && index === this.crosshairIndex) return
    this.crosshairIndex = index
    this.events.emit('crosshairMove', {
      index,
      time: store.times[store.physical(index)]!,
      point,
    })
  }

  /** Match the root element's size and device pixel ratio, repainting if changed. */
  private syncSize(): void {
    const width = this.layers.root.clientWidth
    const height = this.layers.root.clientHeight
    const dpr = window.devicePixelRatio || 1
    if (this.layers.resize({ width, height }, dpr)) {
      this.panzoom.refreshRect()
      this.crosshair.refreshRect()
      this.clampScroll()
      this.scheduler.invalidate('background', 'series', 'overlay', 'axes')
      this.events.emit('layoutChange', undefined)
    }
  }

  private paint(dirty: ReadonlySet<string>): void {
    // Autoscale the price axis to what's visible before drawing dependents.
    if (dirty.has('background') || dirty.has('series') || dirty.has('axes')) {
      this.autoScalePrice()
      this.autoScalePanes()
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
    if (!range) return
    // Widen the domain to contain overlay indicator lines (EMA, Bollinger) so
    // they aren't clipped at the edges of the candle-only range.
    const { low, high } = this.indicatorCtl.extendOverlayRange(
      window,
      range.low,
      range.high,
    )
    this.priceScale.autoScale(low, high)
  }

  /** Autoscale each indicator sub-pane's own scale to its visible plot values. */
  private autoScalePanes(): void {
    if (!this.series) return
    const panes = this.indicatorCtl.paneInstances()
    if (panes.length === 0) return
    const window = this.series.visibleWindow(
      this.timeScaleModel,
      this.plotRect().width,
    )
    for (const inst of panes) inst.autoScalePane(window)
  }

  private paintBackground(): void {
    const ctx = this.layers.getContext('background')
    const { width, height } = this.layers.getSize()
    const { theme } = this.options
    const plot = this.plotRect()
    const main = this.mainRect()
    const dpr = this.layers.getDpr()

    this.layers.clear('background')
    ctx.fillStyle = theme.background
    ctx.fillRect(0, 0, width, height)

    ctx.strokeStyle = theme.gridColor
    ctx.lineWidth = 1
    ctx.beginPath()

    // Horizontal gridlines at the main pane's price ticks.
    const ticks = this.visiblePriceTicks(main.height)
    for (const price of ticks) {
      const y = snap(this.priceScale.priceToY(price, main.height), dpr)
      ctx.moveTo(0, y)
      ctx.lineTo(main.width, y)
    }

    // Vertical gridlines at time labels, spanning every pane.
    for (const { x } of this.timeTicks(plot)) {
      const sx = snap(x, dpr)
      ctx.moveTo(sx, 0)
      ctx.lineTo(sx, plot.height)
    }
    ctx.stroke()

    // A divider line along the top of each indicator sub-pane.
    ctx.strokeStyle = theme.axisBorderColor
    ctx.beginPath()
    for (const { rect } of this.paneSlots()) {
      const y = snap(rect.top, dpr)
      ctx.moveTo(0, y)
      ctx.lineTo(plot.width, y)
    }
    ctx.stroke()
  }

  private paintSeries(): void {
    if (!this.series) return
    this.layers.clear('series')
    const ctx = this.layers.getContext('series')
    const main = this.mainRect()
    const dpr = this.layers.getDpr()
    const window = this.series.visibleWindow(this.timeScaleModel, main.width)

    // Volume first so the series draws on top of its (semi-transparent) bars.
    if (this.options.volumeVisible && this.series.store.hasVolumeData) {
      this.paintVolume(ctx, window, main, dpr)
    }

    this.series.draw(
      ctx,
      this.timeScaleModel,
      this.priceScale,
      main,
      this.options.theme,
      dpr,
    )

    if (this.indicatorCtl.isEmpty || window.from > window.to) return

    // Overlay indicators draw on top of the candles, sharing the main price
    // scale, clipped to the main pane so lines don't bleed into other regions.
    if (this.indicatorCtl.hasOverlays) {
      ctx.save()
      ctx.beginPath()
      ctx.rect(main.left, main.top, main.width, main.height)
      ctx.clip()
      this.indicatorCtl.drawOverlays(
        ctx,
        window,
        this.timeScaleModel,
        this.priceScale,
        main,
      )
      ctx.restore()
    }

    // Pane indicators draw in their own sub-panes, each on its own scale.
    for (const { instance, rect } of this.paneSlots()) {
      ctx.save()
      ctx.beginPath()
      ctx.rect(rect.left, rect.top, rect.width, rect.height)
      ctx.clip()
      this.indicatorCtl.drawPane(
        ctx,
        instance,
        window,
        this.timeScaleModel,
        rect,
        dpr,
      )
      ctx.restore()
    }
  }

  /**
   * The volume histogram plus any volume-scale overlays (Volume MA), both on
   * the hidden 0 → max volume scale spanning the bottom slice of `main`.
   */
  private paintVolume(
    ctx: CanvasRenderingContext2D,
    window: IndexWindow,
    main: PlotRect,
    dpr: number,
  ): void {
    const series = this.series!
    const { theme, volumeHeightRatio } = this.options
    const max = this.indicatorCtl.extendVolumeMax(
      window,
      series.volumeMax(window),
    )
    drawVolume(
      ctx,
      series.store,
      window,
      this.timeScaleModel,
      main,
      {
        max,
        heightRatio: volumeHeightRatio,
        upColor: theme.volumeUpColor,
        downColor: theme.volumeDownColor,
      },
      dpr,
    )

    if (!this.indicatorCtl.hasVolumeOverlays || max <= 0) return
    const regionH = main.height * volumeHeightRatio
    const region: PlotRect = {
      ...main,
      top: main.top + main.height - regionH,
      height: regionH,
    }
    ctx.save()
    ctx.beginPath()
    ctx.rect(main.left, main.top, main.width, main.height)
    ctx.clip()
    this.indicatorCtl.drawOverlays(
      ctx,
      window,
      this.timeScaleModel,
      new PriceScale(0, max, 0),
      region,
      true,
    )
    ctx.restore()
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

    // Main pane price labels.
    const main = this.mainRect()
    const ticks = this.visiblePriceTicks(main.height)
    for (const price of ticks) {
      const y = this.priceScale.priceToY(price, main.height)
      if (y < 0 || y > main.height) continue
      ctx.fillText(this.axisPrice(price, ticks), plot.width + 6, y)
    }

    // Indicator sub-pane price labels (fewer, on each pane's own scale).
    for (const { instance, rect } of this.paneSlots()) {
      if (!instance.visible) continue
      const scale = instance.scale!
      const paneTicks = scaleTicks(
        scale,
        rect.height,
        PRICE_LABEL_SPACING * 1.5,
      )
      for (const value of paneTicks) {
        const y = rect.top + scale.priceToY(value, rect.height)
        if (y < rect.top + 2 || y > rect.top + rect.height - 2) continue
        ctx.fillText(formatAxisNumber(value, paneTicks), plot.width + 6, y)
      }
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
    let hover = false
    if (store && store.size > 0) {
      const main = this.mainRect()
      if (this.options.priceLineVisible) this.paintPriceLine(main)
      if (this.crosshairPoint) {
        hover = this.paintCrosshair(this.crosshairPoint)
      }
    }
    // Re-checked every paint: the button moves under a still pointer when
    // the view scrolls or the magnet snaps to a different level.
    if (hover !== this.orderHover) {
      this.orderHover = hover
      this.layers.root.style.cursor = hover ? 'pointer' : ''
    }
  }

  /** The pane containing CSS-pixel y, with its scale — main pane or a sub-pane. */
  private paneAt(y: number): {
    rect: PlotRect
    scale: PriceScale
    isMain: boolean
  } {
    for (const { instance, rect } of this.paneSlots()) {
      if (y >= rect.top && y <= rect.top + rect.height) {
        return { rect, scale: instance.scale!, isMain: false }
      }
    }
    return { rect: this.mainRect(), scale: this.priceScale, isMain: true }
  }

  /**
   * Dotted horizontal line + filled price-axis badge at the last bar's close
   * (PLAN §8.3), colored by the last candle's direction like TradingView — or
   * in the line color for line/area charts, which carry no direction. Drawn
   * only when that price sits within the autoscaled visible range.
   */
  private paintPriceLine(main: PlotRect): void {
    const series = this.series!
    const store = series.store
    const { width, height } = this.layers.getSize()
    const { theme } = this.options
    const dpr = this.layers.getDpr()

    const p = store.physical(store.lastIndex)
    const close = store.closes[p]!
    const up = close >= store.opens[p]!
    const y = this.priceScale.priceToY(close, main.height)
    if (y < 0 || y > main.height) return

    const color = series.closeOnly
      ? theme.lineColor
      : up
        ? theme.upColor
        : theme.downColor
    const ctx = this.layers.getContext('overlay')
    const lineY = snap(y, dpr)

    ctx.save()
    ctx.strokeStyle = color
    ctx.lineWidth = 1
    ctx.setLineDash([4, 4])
    ctx.beginPath()
    ctx.moveTo(0, lineY)
    ctx.lineTo(main.width, lineY)
    ctx.stroke()
    ctx.restore()

    const text = this.axisPrice(close, this.visiblePriceTicks(main.height))
    const boxH = theme.fontSize + 8
    const boxY = clamp(y - boxH / 2, 0, height - boxH)
    ctx.font = `${theme.fontSize}px ${theme.fontFamily}`
    ctx.textBaseline = 'middle'
    ctx.fillStyle = color
    ctx.fillRect(main.width, boxY, width - main.width, boxH)
    ctx.fillStyle = theme.background
    ctx.textAlign = 'left'
    ctx.fillText(text, main.width + 6, boxY + boxH / 2)
  }

  /**
   * Where the crosshair sits for a pointer position: the nearest bar, and the
   * horizontal line in whichever pane the pointer is in, with the value read on
   * that pane's own scale. In magnet mode the price-pane line snaps to the
   * hovered bar's nearest OHLC price — only with a bar actually under the
   * pointer, and not in the order button's column, so the button can still
   * reach any price.
   */
  private crosshairLine(point: { x: number; y: number }): {
    index: number
    y: number
    value: number
    pane: { rect: PlotRect; scale: PriceScale; isMain: boolean }
  } {
    const store = this.series!.store
    const hovered = this.timeScaleModel.nearestIndex(point.x)
    const index = clamp(hovered, store.firstIndex, store.lastIndex)
    const pane = this.paneAt(point.y)
    const { top, height } = pane.rect
    let y = clamp(point.y, top, top + height)
    let value = pane.scale.yToPrice(y - top, height)
    const magnet =
      pane.isMain &&
      this.options.crosshairMode === 'magnet' &&
      store.has(hovered) &&
      (this.orderHandlers.size === 0 ||
        point.x < pane.rect.width - this.orderButtonSize())
    if (magnet) {
      value = this.series!.snapPrice(index, value)
      y = clamp(top + pane.scale.priceToY(value, height), top, top + height)
    }
    return { index, y, value, pane }
  }

  /** The "+" order button for the current crosshair, or null when not shown. */
  private orderButton(): ButtonRect | null {
    const point = this.crosshairPoint
    if (this.orderHandlers.size === 0 || !point) return null
    if (!this.series || this.series.store.size === 0) return null
    const { y, pane } = this.crosshairLine(point)
    if (!pane.isMain) return null
    const { rect } = pane
    return orderButtonRect(
      rect.width,
      y,
      this.orderButtonSize(),
      rect.top,
      rect.top + rect.height,
    )
  }

  /** Matches the height of the crosshair's price label beside it. */
  private orderButtonSize(): number {
    return this.options.theme.fontSize + 8
  }

  private claimOrderPress(point: { x: number; y: number }): boolean {
    const button = this.orderButton()
    this.orderPressed = button !== null && hitsButton(button, point)
    return this.orderPressed
  }

  private onPointerUp = (e: PointerEvent): void => {
    if (!this.orderPressed) return
    this.orderPressed = false
    const box = this.layers.root.getBoundingClientRect()
    const point = { x: e.clientX - box.left, y: e.clientY - box.top }
    const button = this.orderButton()
    if (!button || !hitsButton(button, point)) return

    const store = this.series!.store
    const index = this.timeScaleModel.nearestIndex(point.x)
    const event: OrderIntentEvent = {
      price: this.crosshairLine(this.crosshairPoint!).value,
      time: store.has(index) ? store.times[store.physical(index)]! : null,
      index,
      paneId: 'main',
      point,
      clientPoint: { x: e.clientX, y: e.clientY },
    }
    for (const handler of [...this.orderHandlers]) handler(event)
  }

  private paintOrderButton(
    ctx: CanvasRenderingContext2D,
    button: ButtonRect,
    hover: boolean,
  ): void {
    const { theme } = this.options
    const dpr = this.layers.getDpr()
    const { left, top, size } = button
    ctx.fillStyle = hover ? theme.lineColor : theme.crosshairColor
    ctx.fillRect(left, top, size, size)

    // The "+" glyph as two device-pixel-snapped bars, so it stays crisp.
    const t = Math.max(1, Math.round(1.5 * dpr)) / dpr
    const arm = Math.round(size * 0.3)
    const cx = Math.round((left + size / 2 - t / 2) * dpr) / dpr
    const cy = Math.round((top + size / 2 - t / 2) * dpr) / dpr
    ctx.fillStyle = theme.background
    ctx.fillRect(cx + t / 2 - arm, cy, arm * 2, t)
    ctx.fillRect(cx, cy + t / 2 - arm, t, arm * 2)
  }

  /**
   * Dotted crosshair lines + axis value labels, following the pointer (PLAN
   * §8.2), plus the order button when enabled. Returns whether the pointer is
   * over that button.
   */
  private paintCrosshair(point: { x: number; y: number }): boolean {
    const store = this.series!.store
    const { width, height } = this.layers.getSize()
    const { theme } = this.options
    const ts = this.timeScaleModel
    const dpr = this.layers.getDpr()
    const plot = this.plotRect()

    const {
      index: nearest,
      y: clampedY,
      value,
      pane,
    } = this.crosshairLine(point)
    const lineX = snap(ts.indexToX(nearest), dpr)
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

    const button = this.orderButton()
    const hover = button !== null && hitsButton(button, point)
    if (button) this.paintOrderButton(ctx, button, hover)

    ctx.font = `${theme.fontSize}px ${theme.fontFamily}`
    ctx.textBaseline = 'middle'
    ctx.fillStyle = theme.crosshairColor

    // Price label (right gutter), centered on the horizontal line, in the
    // pointer's pane (price for the main pane, plain value for sub-panes).
    const priceText = pane.isMain
      ? this.axisPrice(value, this.visiblePriceTicks(pane.rect.height))
      : formatAxisNumber(
          value,
          scaleTicks(pane.scale, pane.rect.height, PRICE_LABEL_SPACING * 1.5),
        )
    const priceBoxH = theme.fontSize + 8
    const priceBoxY = clamp(clampedY - priceBoxH / 2, 0, height - priceBoxH)
    ctx.fillRect(plot.width, priceBoxY, width - plot.width, priceBoxH)
    ctx.fillStyle = theme.background
    ctx.textAlign = 'left'
    ctx.fillText(priceText, plot.width + 6, priceBoxY + priceBoxH / 2)

    // Time label (bottom gutter), centered on the vertical line.
    const time = store.times[store.physical(nearest)]!
    const timeText = formatCrosshairTime(
      time,
      this.barInterval() >= 86_400 ? undefined : (this.timeZone() ?? 'UTC'),
    )
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
    return hover
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
    return timeAxisLabels(
      bars,
      ts.barWidth,
      TIME_LABEL_SPACING,
      this.timeZone(),
    ).map(l => ({
      x: ts.indexToX(l.index),
      text: l.text,
    }))
  }

  /**
   * A price for axis/crosshair labels: at least the instrument precision (or
   * `priceDecimals`), more when the tick step is finer, via `priceFormatter`.
   */
  private axisPrice(price: number, ticks: readonly number[]): string {
    const decimals = Math.max(this.minPriceDecimals(), priceTickDecimals(ticks))
    return this.options.priceFormatter
      ? this.options.priceFormatter(price, decimals)
      : price.toFixed(decimals)
  }

  /** Tear down observers, listeners, canvases, and any pending frame. */
  remove(): void {
    this.events.clear()
    this.orderHandlers.clear()
    this.detachDataSource()
    this.layers.root.removeEventListener('pointerup', this.onPointerUp)
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

/** "Nice" tick values for an arbitrary scale/height, targeting `spacing` px per label. */
function scaleTicks(
  scale: PriceScale,
  height: number,
  spacing: number,
): number[] {
  const count = Math.max(2, Math.floor(height / spacing))
  return priceTicks(scale.min, scale.max, count)
}

/** Formats a plain indicator-axis number at the precision implied by its tick step. */
function formatAxisNumber(value: number, ticks: readonly number[]): string {
  return value.toFixed(priceTickDecimals(ticks))
}

/**
 * Full label for the crosshair's time-axis box — unlike the axis ticks, always
 * complete since it has no previous label to diff against. Intraday bars
 * (`timeZone` given, possibly UTC) show date + time in that zone; daily and
 * coarser bars (`timeZone` undefined) show the calendar date only.
 */
function formatCrosshairTime(timeSec: number, timeZone?: string): string {
  const intraday = timeZone !== undefined
  const d = new Date(toZoned(timeSec, timeZone) * 1000)
  const month = d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' })
  const date = `${month} ${d.getUTCDate()}`
  if (!intraday) return `${date} ${d.getUTCFullYear()}`
  const hh = String(d.getUTCHours()).padStart(2, '0')
  const mm = String(d.getUTCMinutes()).padStart(2, '0')
  return `${date} ${hh}:${mm}`
}

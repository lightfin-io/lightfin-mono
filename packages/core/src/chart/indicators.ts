import type { StoreReader } from '../data/barReader'
import type {
  BandFill,
  IndicatorCalc,
  IndicatorDefinition,
  PlotStyle,
  ReferenceLevel,
} from '../indicators/types'
import { PriceScale } from '../scales/priceScale'
import type { TimeScale } from '../scales/timeScale'
import type { PlotRect } from './chart'
import type { ChartTheme } from './options'

/** Inclusive integer index window actually on screen. */
interface IndexWindow {
  from: number
  to: number
}

/**
 * Inclusive index window for indicator plots. `to` follows the slots on
 * screen and is not clamped to the last bar, so a value stored ahead of the
 * data (Ichimoku's leading span) can draw into the empty right margin.
 * Returns an empty window (`from > to`) when the store has no bars or the
 * view sits entirely before the first one.
 */
export function indicatorSlotWindow(
  visible: { from: number; to: number },
  firstIndex: number,
  lastIndex: number,
): { from: number; to: number } {
  if (lastIndex < firstIndex) return { from: 0, to: -1 }
  const from = Math.max(firstIndex, Math.floor(visible.from))
  const to = Math.ceil(visible.to)
  return from <= to ? { from, to } : { from: 0, to: -1 }
}

/** A live indicator added to the chart: its definition, resolved options, plots, and calc. */
export class IndicatorInstance {
  // The core doesn't model each indicator's option shape — it just merges
  // caller options over the definition's defaults and passes them through, so
  // the Options generic is erased to `any` at this boundary.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly def: IndicatorDefinition<any>
  readonly options: Readonly<Record<string, unknown>>
  readonly params: (string | number)[]
  readonly overlay: boolean
  /** Overlays only: draws on the hidden volume scale rather than the price scale. */
  readonly onVolumeScale: boolean
  readonly plots: PlotStyle[]
  readonly fills: BandFill[]
  readonly levels: ReferenceLevel[]
  /** Pane indicators only: the pane's own price scale (null for overlays). */
  readonly scale: PriceScale | null
  /** Hidden instances keep their cache (and pane slot) but don't draw or autoscale. */
  visible = true
  private readonly fixedRange: { min: number; max: number } | null
  private readonly calc: IndicatorCalc

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(
    def: IndicatorDefinition<any>,
    options: Record<string, unknown>,
    theme: ChartTheme,
    colorSlot: number,
  ) {
    // Colors from the theme palette fill in for any `colorKeys` the caller
    // didn't set explicitly; an explicit color (including one already
    // resolved onto `options` by a prior `setOptions` call) always wins.
    const paletteDefaults: Record<string, string> = {}
    def.colorKeys?.forEach((key: string, i: number) => {
      if (key in options) return
      const palette = theme.indicatorPalette
      paletteDefaults[key] = palette[(colorSlot + i) % palette.length]!
    })
    const resolved = { ...def.defaultOptions, ...paletteDefaults, ...options }
    this.def = def
    this.options = resolved
    this.params = def.params?.(resolved) ?? []
    this.overlay = def.overlay
    this.onVolumeScale = def.overlay && def.scale === 'volume'
    this.plots = def.plots(resolved)
    this.fills = def.fills?.(resolved) ?? []
    this.levels = def.overlay ? [] : (def.levels?.(resolved) ?? [])
    this.fixedRange = def.overlay ? null : (def.fixedRange?.(resolved) ?? null)
    this.scale = def.overlay ? null : new PriceScale(0, 1, 0.1)
    this.calc = def.create(resolved)
  }

  recompute(reader: StoreReader): void {
    this.calc.calculateAll(reader)
  }

  updateLast(reader: StoreReader): void {
    this.calc.updateLast(reader)
  }

  value(plotKey: string, index: number): number {
    return this.calc.value(plotKey, index)
  }

  /**
   * Set this pane indicator's scale for the visible window: its fixed range if
   * declared, else autoscaled to its plot values (always including 0 when it
   * has a histogram so the baseline is on screen). No-op for overlays.
   */
  autoScalePane(window: IndexWindow): void {
    if (!this.scale || !this.visible) return
    if (this.fixedRange) {
      this.scale.min = this.fixedRange.min
      this.scale.max = this.fixedRange.max
      return
    }
    let low = Infinity
    let high = -Infinity
    const hasHistogram = this.plots.some(p => p.type === 'histogram')
    if (hasHistogram) {
      low = 0
      high = 0
    }
    for (const plot of this.plots) {
      for (let i = window.from; i <= window.to; i++) {
        const v = this.value(plot.key, i)
        if (!Number.isFinite(v)) continue
        if (v < low) low = v
        if (v > high) high = v
      }
    }
    if (low <= high) this.scale.autoScale(low, high)
  }
}

/**
 * Owns the chart's indicators and the generic plot renderer. This
 * is the fixed "host" that stays in core; the unbounded indicator *catalog*
 * (SMA, EMA, …) loads lazily from its own subpath chunks, so the core bundle
 * never carries it.
 *
 * Incremental contract: `recomputeAll` runs on reset/backfill, `updateLast` on
 * a live tick/new bar; pan/zoom only re-slices the cached outputs in `draw`,
 * never recomputes.
 */
export class IndicatorController {
  private readonly instances: IndicatorInstance[] = []
  private readonly panes: IndicatorInstance[] = []

  add(instance: IndicatorInstance, reader: StoreReader): void {
    instance.recompute(reader)
    this.instances.push(instance)
    if (!instance.overlay) this.panes.push(instance)
  }

  remove(instance: IndicatorInstance): void {
    const i = this.instances.indexOf(instance)
    if (i !== -1) this.instances.splice(i, 1)
    const pane = this.panes.indexOf(instance)
    if (pane !== -1) this.panes.splice(pane, 1)
  }

  /** Swap `prev` for `next` in place (keeping draw/pane order), computing `next`. */
  replace(
    prev: IndicatorInstance,
    next: IndicatorInstance,
    reader: StoreReader,
  ): void {
    const i = this.instances.indexOf(prev)
    if (i === -1) return
    next.visible = prev.visible
    next.recompute(reader)
    this.instances[i] = next
    const pane = this.panes.indexOf(prev)
    if (pane !== -1) this.panes[pane] = next
  }

  /** Every instance, in the order added. */
  all(): readonly IndicatorInstance[] {
    return this.instances
  }

  get isEmpty(): boolean {
    return this.instances.length === 0
  }

  /** Whether any visible overlay draws on the main price scale. */
  get hasOverlays(): boolean {
    return this.instances.some(i => i.visible && i.overlay && !i.onVolumeScale)
  }

  /** Whether any visible overlay draws on the hidden volume scale (e.g. Volume MA). */
  get hasVolumeOverlays(): boolean {
    return this.instances.some(i => i.visible && i.onVolumeScale)
  }

  /** Pane indicators, in display order. */
  paneInstances(): readonly IndicatorInstance[] {
    return this.panes
  }

  /** Exchange two pane indicators. Each keeps its place in `instances`. */
  swapPanes(i: number, j: number): void {
    const pane = this.panes[i]!
    this.panes[i] = this.panes[j]!
    this.panes[j] = pane
  }

  recomputeAll(reader: StoreReader): void {
    for (const inst of this.instances) inst.recompute(reader)
  }

  updateLast(reader: StoreReader): void {
    for (const inst of this.instances) inst.updateLast(reader)
  }

  /**
   * Min/max of every overlay plot across the visible window, folded into an
   * existing `[low, high]` so overlay lines (EMA, Bollinger bands) aren't
   * clipped by the candle-only autoscale. Returns the (possibly widened) range.
   */
  extendOverlayRange(
    window: IndexWindow,
    low: number,
    high: number,
  ): { low: number; high: number } {
    for (const inst of this.instances) {
      if (!inst.visible || !inst.overlay || inst.onVolumeScale) continue
      for (const plot of inst.plots) {
        for (let i = window.from; i <= window.to; i++) {
          const v = inst.value(plot.key, i)
          if (!Number.isFinite(v)) continue
          if (v < low) low = v
          if (v > high) high = v
        }
      }
    }
    return { low, high }
  }

  /**
   * Max of every volume-scale overlay plot across the visible window, folded
   * into the histogram's own max so e.g. a Volume MA lagging a volume spike
   * that just scrolled off-screen isn't clipped at the top of the region.
   */
  extendVolumeMax(window: IndexWindow, max: number): number {
    for (const inst of this.instances) {
      if (!inst.visible || !inst.onVolumeScale) continue
      for (const plot of inst.plots) {
        for (let i = window.from; i <= window.to; i++) {
          const v = inst.value(plot.key, i)
          if (Number.isFinite(v) && v > max) max = v
        }
      }
    }
    return max
  }

  /**
   * Draw overlay indicators onto the (already clipped) series context: the
   * price-scale ones by default, or with `volumeScale` set, the volume-scale
   * ones mapped into the volume histogram's region `plot`.
   */
  drawOverlays(
    ctx: CanvasRenderingContext2D,
    window: IndexWindow,
    timeScale: TimeScale,
    priceScale: PriceScale,
    plot: PlotRect,
    volumeScale = false,
  ): void {
    for (const inst of this.instances) {
      if (!inst.visible || !inst.overlay || inst.onVolumeScale !== volumeScale)
        continue
      // Bands first, so the lines read on top of their own shaded fill.
      for (const fill of inst.fills) {
        drawBandFill(ctx, inst, fill, window, timeScale, priceScale, plot)
      }
      for (const style of inst.plots) {
        drawLinePlot(ctx, inst, style, window, timeScale, priceScale, plot)
      }
    }
  }

  /**
   * Draw one pane indicator into its own sub-pane `rect` using its own `scale`:
   * reference levels first, then histogram columns, then lines. The caller
   * clips to `rect`.
   */
  drawPane(
    ctx: CanvasRenderingContext2D,
    inst: IndicatorInstance,
    window: IndexWindow,
    timeScale: TimeScale,
    rect: PlotRect,
    dpr: number,
  ): void {
    const scale = inst.scale
    if (!scale || !inst.visible) return

    for (const level of inst.levels) {
      const y = rect.top + scale.priceToY(level.value, rect.height)
      if (y < rect.top || y > rect.top + rect.height) continue
      ctx.save()
      ctx.strokeStyle = level.color
      ctx.lineWidth = 1
      if (level.dashed !== false) ctx.setLineDash([3, 3])
      ctx.beginPath()
      ctx.moveTo(rect.left, snapPx(y, dpr))
      ctx.lineTo(rect.left + rect.width, snapPx(y, dpr))
      ctx.stroke()
      ctx.restore()
    }

    for (const style of inst.plots) {
      if (style.type === 'histogram') {
        drawHistogramPlot(ctx, inst, style, window, timeScale, scale, rect, dpr)
      } else {
        drawLinePlot(ctx, inst, style, window, timeScale, scale, rect)
      }
    }
  }
}

/**
 * Stroke one plot as a polyline over the visible window, lifting the pen across
 * NaN gaps (warmup) so the line doesn't connect through undefined regions.
 * One `beginPath`/`stroke` for the whole plot.
 */
function drawLinePlot(
  ctx: CanvasRenderingContext2D,
  inst: IndicatorInstance,
  style: PlotStyle,
  window: IndexWindow,
  timeScale: TimeScale,
  priceScale: PriceScale,
  plot: PlotRect,
): void {
  ctx.beginPath()
  let pen = false
  for (let i = window.from; i <= window.to; i++) {
    const v = inst.value(style.key, i)
    if (!Number.isFinite(v)) {
      pen = false
      continue
    }
    const x = plot.left + timeScale.indexToX(i)
    const y = plot.top + priceScale.priceToY(v, plot.height)
    if (pen) ctx.lineTo(x, y)
    else ctx.moveTo(x, y)
    pen = true
  }
  ctx.strokeStyle = style.color
  ctx.lineWidth = style.lineWidth ?? 1.5
  ctx.stroke()
}

/**
 * Fill the region between an `upper` and `lower` plot across the visible window
 * as a translucent band. Each contiguous run where both edges are defined
 * becomes one polygon (forward along the upper edge, back along the lower), so
 * warmup gaps don't smear the fill across undefined regions.
 */
function drawBandFill(
  ctx: CanvasRenderingContext2D,
  inst: IndicatorInstance,
  fill: BandFill,
  window: IndexWindow,
  timeScale: TimeScale,
  priceScale: PriceScale,
  plot: PlotRect,
): void {
  ctx.fillStyle = fill.color
  // Lower-edge x/y of the current run, to retrace backwards when it ends.
  const lowerXs: number[] = []
  const lowerYs: number[] = []
  let open = false

  const flush = () => {
    if (!open) return
    for (let k = lowerXs.length - 1; k >= 0; k--) {
      ctx.lineTo(lowerXs[k]!, lowerYs[k]!)
    }
    ctx.closePath()
    ctx.fill()
    lowerXs.length = 0
    lowerYs.length = 0
    open = false
  }

  for (let i = window.from; i <= window.to; i++) {
    const up = inst.value(fill.upper, i)
    const lo = inst.value(fill.lower, i)
    if (!Number.isFinite(up) || !Number.isFinite(lo)) {
      flush()
      continue
    }
    const x = plot.left + timeScale.indexToX(i)
    const yUp = plot.top + priceScale.priceToY(up, plot.height)
    const yLo = plot.top + priceScale.priceToY(lo, plot.height)
    if (!open) {
      ctx.beginPath()
      ctx.moveTo(x, yUp)
      open = true
    } else {
      ctx.lineTo(x, yUp)
    }
    lowerXs.push(x)
    lowerYs.push(yLo)
  }
  flush()
}

/**
 * Draw a histogram plot (e.g. MACD) as columns from the pane's zero baseline,
 * bucketed into positive vs negative so each color is one batched `fill()`.
 * Columns fill ~80% of the bar slot.
 */
function drawHistogramPlot(
  ctx: CanvasRenderingContext2D,
  inst: IndicatorInstance,
  style: PlotStyle,
  window: IndexWindow,
  timeScale: TimeScale,
  scale: PriceScale,
  rect: PlotRect,
  dpr: number,
): void {
  const baseY = rect.top + scale.priceToY(0, rect.height)
  const colW = Math.max(1 / dpr, timeScale.barWidth * 0.8)
  const half = colW / 2
  const pos = new Path2D()
  const neg = new Path2D()

  for (let i = window.from; i <= window.to; i++) {
    const v = inst.value(style.key, i)
    if (!Number.isFinite(v) || v === 0) continue
    const x = snapPx(rect.left + timeScale.indexToX(i) - half, dpr)
    const y = rect.top + scale.priceToY(v, rect.height)
    const top = Math.min(y, baseY)
    const h = Math.max(1, Math.abs(y - baseY))
    ;(v >= 0 ? pos : neg).rect(x, top, colW, h)
  }

  ctx.fillStyle = style.color
  ctx.fill(pos)
  ctx.fillStyle = style.negativeColor ?? style.color
  ctx.fill(neg)
}

/** Snap a CSS-px coordinate to a whole device pixel for crisp edges. */
function snapPx(cssPx: number, dpr: number): number {
  return Math.round(cssPx * dpr) / dpr
}

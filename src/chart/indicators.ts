import type { StoreReader } from '../data/barReader.ts'
import type {
  BandFill,
  IndicatorCalc,
  IndicatorDefinition,
  PlotStyle,
  ReferenceLevel,
} from '../indicators/types.ts'
import { PriceScale } from '../scales/priceScale.ts'
import type { TimeScale } from '../scales/timeScale.ts'
import type { PlotRect } from './chart.ts'

/** Inclusive integer index window actually on screen. */
interface IndexWindow {
  from: number
  to: number
}

/** A live indicator added to the chart: its definition, resolved options, plots, and calc. */
export class IndicatorInstance {
  readonly overlay: boolean
  readonly plots: PlotStyle[]
  readonly fills: BandFill[]
  readonly levels: ReferenceLevel[]
  /** Pane indicators only: the pane's own price scale (null for overlays). */
  readonly scale: PriceScale | null
  private readonly fixedRange: { min: number; max: number } | null
  private readonly calc: IndicatorCalc

  // The core doesn't model each indicator's option shape — it just merges
  // caller options over the definition's defaults and passes them through, so
  // the Options generic is erased to `any` at this boundary.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(def: IndicatorDefinition<any>, options: Record<string, unknown>) {
    const resolved = { ...def.defaultOptions, ...options }
    this.overlay = def.overlay
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
    if (!this.scale) return
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
 * Owns the chart's indicators and the generic plot renderer (PLAN §8.4). This
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

  add(instance: IndicatorInstance, reader: StoreReader): void {
    instance.recompute(reader)
    this.instances.push(instance)
  }

  remove(instance: IndicatorInstance): void {
    const i = this.instances.indexOf(instance)
    if (i !== -1) this.instances.splice(i, 1)
  }

  get isEmpty(): boolean {
    return this.instances.length === 0
  }

  get hasOverlays(): boolean {
    return this.instances.some(i => i.overlay)
  }

  /** Pane indicators (own sub-pane), in the order they were added. */
  paneInstances(): IndicatorInstance[] {
    return this.instances.filter(i => !i.overlay)
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
      if (!inst.overlay) continue
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

  /** Draw all overlay indicators onto the (already clipped) series context. */
  drawOverlays(
    ctx: CanvasRenderingContext2D,
    window: IndexWindow,
    timeScale: TimeScale,
    priceScale: PriceScale,
    plot: PlotRect,
  ): void {
    for (const inst of this.instances) {
      if (!inst.overlay) continue
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
    if (!scale) return

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
 * One `beginPath`/`stroke` for the whole plot (PLAN §9 batching).
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
 * bucketed into positive vs negative so each color is one batched `fill()`
 * (PLAN §9). Columns fill ~80% of the bar slot.
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

/** Snap a CSS-px coordinate to a whole device pixel for crisp edges (PLAN §9). */
function snapPx(cssPx: number, dpr: number): number {
  return Math.round(cssPx * dpr) / dpr
}

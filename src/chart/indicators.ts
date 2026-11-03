import type { StoreReader } from '../data/barReader.ts'
import type {
  IndicatorCalc,
  IndicatorDefinition,
  PlotStyle,
} from '../indicators/types.ts'
import type { PriceScale } from '../scales/priceScale.ts'
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
  private readonly calc: IndicatorCalc

  // The core doesn't model each indicator's option shape — it just merges
  // caller options over the definition's defaults and passes them through, so
  // the Options generic is erased to `any` at this boundary.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(def: IndicatorDefinition<any>, options: Record<string, unknown>) {
    const resolved = { ...def.defaultOptions, ...options }
    this.overlay = def.overlay
    this.plots = def.plots(resolved)
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
      for (const style of inst.plots) {
        drawLinePlot(ctx, inst, style, window, timeScale, priceScale, plot)
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

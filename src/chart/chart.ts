import { LayerManager } from '../render/layers.ts'
import { FrameScheduler } from '../render/scheduler.ts'
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

/**
 * The root chart object. Owns the layered canvas stack, the frame scheduler,
 * and the container resize observer. Series/scales/interaction are attached in
 * later phases; this phase establishes the rendering foundation (PLAN §5):
 * DPR-correct layered canvases, resize-to-container, and a dirty-flag rAF
 * paint loop drawing the background grid.
 */
export class Chart {
  private readonly container: HTMLElement
  private readonly options: ChartOptions
  private readonly layers: LayerManager
  private readonly scheduler: FrameScheduler
  private readonly resizeObserver: ResizeObserver

  constructor(container: HTMLElement, options: ChartOptionsInput = {}) {
    this.container = container
    this.options = resolveOptions(options)
    this.layers = new LayerManager(container)
    this.scheduler = new FrameScheduler(dirty => this.paint(dirty))

    this.resizeObserver = new ResizeObserver(() => this.syncSize())
    this.resizeObserver.observe(container)
    this.syncSize()
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

  /** Match the container size and device pixel ratio, repainting if changed. */
  private syncSize(): void {
    const width = this.container.clientWidth
    const height = this.container.clientHeight
    const dpr = window.devicePixelRatio || 1
    if (this.layers.resize({ width, height }, dpr)) {
      this.scheduler.invalidate('background', 'series', 'overlay', 'axes')
    }
  }

  private paint(dirty: ReadonlySet<string>): void {
    if (dirty.has('background')) this.paintBackground()
  }

  private paintBackground(): void {
    const ctx = this.layers.getContext('background')
    const { width, height } = this.layers.getSize()
    const { theme } = this.options
    const plot = this.plotRect()

    this.layers.clear('background')
    ctx.fillStyle = theme.background
    ctx.fillRect(0, 0, width, height)

    // Placeholder grid until scales land in Phase 1. Snap to device pixels for
    // crisp 1px lines (PLAN §9).
    ctx.strokeStyle = theme.gridColor
    ctx.lineWidth = 1
    ctx.beginPath()
    const step = 80
    for (let x = step; x < plot.width; x += step) {
      const px = Math.round(x) + 0.5
      ctx.moveTo(px, 0)
      ctx.lineTo(px, plot.height)
    }
    for (let y = step; y < plot.height; y += step) {
      const py = Math.round(y) + 0.5
      ctx.moveTo(0, py)
      ctx.lineTo(plot.width, py)
    }
    ctx.stroke()
  }

  /** Tear down observers, canvases, and any pending frame. */
  remove(): void {
    this.resizeObserver.disconnect()
    this.scheduler.dispose()
    this.layers.dispose()
  }
}

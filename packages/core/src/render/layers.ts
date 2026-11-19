/**
 * The layered canvas stack. Each layer is an absolutely-positioned
 * <canvas> in a stack so a crosshair move never repaints candles and a candle
 * redraw never repaints the static grid. Transparent layers composite
 * naturally — every layer except the background clears to transparent.
 */
export type LayerName =
  | 'background' // gridlines, pane backgrounds — redraw on resize/scale change
  | 'series' // candles, volume, indicator overlays — redraw on data/viewport change
  | 'axes' // time/price axis strips — redraw on scale change
  | 'overlay' // crosshair, current-price line, in-flight annotations — redraw per pointer move

// Bottom to top. `overlay` paints last so the crosshair's axis labels sit on
// top of the (otherwise static) axis strips instead of being hidden by them.
export const LAYER_ORDER: readonly LayerName[] = [
  'background',
  'series',
  'axes',
  'overlay',
]

export interface Size {
  width: number
  height: number
}

interface Layer {
  canvas: HTMLCanvasElement
  ctx: CanvasRenderingContext2D
}

/**
 * Owns the <canvas> elements, their device-pixel sizing, and the 2D contexts.
 * All canvases are sized to CSS pixels × devicePixelRatio and scaled via
 * ctx.scale(dpr, dpr) so drawing code works in CSS-pixel coordinates.
 */
export class LayerManager {
  readonly root: HTMLDivElement
  private layers = new Map<LayerName, Layer>()
  private size: Size = { width: 0, height: 0 }
  private dpr = 1

  constructor(container: HTMLElement) {
    this.root = document.createElement('div')
    this.root.style.position = 'relative'
    this.root.style.width = '100%'
    this.root.style.height = '100%'
    this.root.style.overflow = 'hidden'

    for (const name of LAYER_ORDER) {
      const canvas = document.createElement('canvas')
      canvas.style.position = 'absolute'
      canvas.style.inset = '0'
      canvas.style.width = '100%'
      canvas.style.height = '100%'
      // The series/background layers must not eat pointer events meant for
      // the interaction surface; the container handles them.
      canvas.style.pointerEvents = 'none'
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('lightfin: 2D canvas context unavailable')
      this.root.appendChild(canvas)
      this.layers.set(name, { canvas, ctx })
    }

    container.appendChild(this.root)
  }

  getContext(name: LayerName): CanvasRenderingContext2D {
    const layer = this.layers.get(name)
    if (!layer) throw new Error(`lightfin: unknown layer "${name}"`)
    return layer.ctx
  }

  getSize(): Readonly<Size> {
    return this.size
  }

  getDpr(): number {
    return this.dpr
  }

  /**
   * Resize all canvases to match `size` CSS pixels at the given devicePixelRatio.
   * Returns true if anything actually changed (so callers can skip redraws).
   */
  resize(size: Size, dpr: number): boolean {
    if (
      size.width === this.size.width &&
      size.height === this.size.height &&
      dpr === this.dpr
    ) {
      return false
    }
    this.size = { ...size }
    this.dpr = dpr

    const deviceW = Math.round(size.width * dpr)
    const deviceH = Math.round(size.height * dpr)
    for (const { canvas, ctx } of this.layers.values()) {
      canvas.width = deviceW
      canvas.height = deviceH
      // Draw in CSS-pixel space; the backing store is denser by `dpr`.
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    return true
  }

  /** Clear one layer to transparent (full backing store). */
  clear(name: LayerName): void {
    const { ctx } = this.layers.get(name)!
    ctx.save()
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height)
    ctx.restore()
  }

  dispose(): void {
    this.root.remove()
    this.layers.clear()
  }
}

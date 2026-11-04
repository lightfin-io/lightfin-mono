/**
 * Pointer-driven pan/zoom (PLAN §8.1).
 *
 * Pointer Events exclusively, so mouse, touch, and pen share one code path:
 *   - drag (one pointer) = pan, reported as a horizontal pixel delta
 *   - wheel = zoom, anchored on the cursor
 *   - pinch (two pointers) = zoom, anchored on the two-pointer centroid
 *
 * The controller only measures gestures and reports them in CSS pixels relative
 * to the element; translating deltas into scale changes is the chart's job.
 */
export interface PanZoomHandlers {
  /** Horizontal drag delta in CSS px since the last move. */
  onPan(dx: number): void
  /** Multiplicative zoom; `anchorX` is the CSS-px x to keep pinned. */
  onZoom(factor: number, anchorX: number): void
  /**
   * Return true to claim a pointerdown at this CSS-px point (e.g. it landed on
   * a button), so it doesn't start a pan.
   */
  claim?(point: { x: number; y: number }, e: PointerEvent): boolean
}

/** How much one wheel notch zooms. */
const WHEEL_ZOOM_STEP = 0.0015

interface ActivePointer {
  x: number
  y: number
}

export class PanZoomController {
  private readonly el: HTMLElement
  private readonly handlers: PanZoomHandlers
  private readonly pointers = new Map<number, ActivePointer>()
  private rect: DOMRect
  private lastPanX = 0
  private lastPinchDist = 0

  constructor(el: HTMLElement, handlers: PanZoomHandlers) {
    this.el = el
    this.handlers = handlers
    this.rect = el.getBoundingClientRect()

    el.style.touchAction = 'none'
    el.style.pointerEvents = 'auto'
    el.addEventListener('pointerdown', this.onPointerDown)
    el.addEventListener('pointermove', this.onPointerMove)
    el.addEventListener('pointerup', this.onPointerUp)
    el.addEventListener('pointercancel', this.onPointerUp)
    el.addEventListener('wheel', this.onWheel, { passive: false })
  }

  /** Re-measure the element rect; call when the container moves or resizes. */
  refreshRect(): void {
    this.rect = this.el.getBoundingClientRect()
  }

  /** Whether a pan or pinch is in progress. */
  get busy(): boolean {
    return this.pointers.size > 0
  }

  private localX(clientX: number): number {
    return clientX - this.rect.left
  }

  private onPointerDown = (e: PointerEvent): void => {
    this.refreshRect()
    const point = { x: this.localX(e.clientX), y: e.clientY - this.rect.top }
    if (this.pointers.size === 0 && this.handlers.claim?.(point, e)) return
    this.el.setPointerCapture(e.pointerId)
    this.pointers.set(e.pointerId, point)

    if (this.pointers.size === 1) {
      this.lastPanX = this.localX(e.clientX)
    } else if (this.pointers.size === 2) {
      this.lastPinchDist = this.pinchDistance()
    }
  }

  private onPointerMove = (e: PointerEvent): void => {
    const p = this.pointers.get(e.pointerId)
    if (!p) return
    p.x = this.localX(e.clientX)
    p.y = e.clientY - this.rect.top

    if (this.pointers.size === 1) {
      const x = this.localX(e.clientX)
      this.handlers.onPan(x - this.lastPanX)
      this.lastPanX = x
    } else if (this.pointers.size === 2) {
      const dist = this.pinchDistance()
      if (this.lastPinchDist > 0 && dist > 0) {
        this.handlers.onZoom(dist / this.lastPinchDist, this.pinchCentroidX())
      }
      this.lastPinchDist = dist
    }
  }

  private onPointerUp = (e: PointerEvent): void => {
    this.pointers.delete(e.pointerId)
    if (this.el.hasPointerCapture(e.pointerId)) {
      this.el.releasePointerCapture(e.pointerId)
    }
    // Reset anchors so a surviving pointer resumes panning cleanly.
    const remaining = [...this.pointers.values()]
    if (remaining.length === 1) this.lastPanX = remaining[0]!.x
    else if (remaining.length === 2) this.lastPinchDist = this.pinchDistance()
  }

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault()
    this.refreshRect()
    const factor = Math.exp(-e.deltaY * WHEEL_ZOOM_STEP)
    this.handlers.onZoom(factor, this.localX(e.clientX))
  }

  private pinchDistance(): number {
    const [a, b] = [...this.pointers.values()]
    if (!a || !b) return 0
    return Math.hypot(a.x - b.x, a.y - b.y)
  }

  private pinchCentroidX(): number {
    const [a, b] = [...this.pointers.values()]
    if (!a || !b) return 0
    return (a.x + b.x) / 2
  }

  dispose(): void {
    this.el.removeEventListener('pointerdown', this.onPointerDown)
    this.el.removeEventListener('pointermove', this.onPointerMove)
    this.el.removeEventListener('pointerup', this.onPointerUp)
    this.el.removeEventListener('pointercancel', this.onPointerUp)
    this.el.removeEventListener('wheel', this.onWheel)
    this.pointers.clear()
  }
}

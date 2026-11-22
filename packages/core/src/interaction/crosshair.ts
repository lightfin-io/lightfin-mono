/**
 * Crosshair hover tracking.
 *
 * Reports the pointer's CSS-px position relative to the element, or `null`
 * when it leaves. Mouse/pen only: a touch drag pans, so the touch crosshair
 * comes from the press-and-hold gesture in {@link PanZoomController}.
 */
export interface CrosshairHandlers {
  onMove(point: { x: number; y: number } | null): void
}

export class CrosshairController {
  private readonly el: HTMLElement
  private readonly handlers: CrosshairHandlers

  constructor(el: HTMLElement, handlers: CrosshairHandlers) {
    this.el = el
    this.handlers = handlers

    el.addEventListener('pointermove', this.onPointerMove)
    el.addEventListener('pointerleave', this.onPointerLeave)
    el.addEventListener('pointercancel', this.onPointerLeave)
  }

  private onPointerMove = (e: PointerEvent): void => {
    if (e.pointerType === 'touch') return
    // Scrolling can move the chart in the viewport without resizing it.
    const rect = this.el.getBoundingClientRect()
    this.handlers.onMove({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    })
  }

  private onPointerLeave = (e: PointerEvent): void => {
    // A lifted finger "leaves" too; the touch crosshair outlives it.
    if (e.pointerType === 'touch') return
    this.handlers.onMove(null)
  }

  dispose(): void {
    this.el.removeEventListener('pointermove', this.onPointerMove)
    this.el.removeEventListener('pointerleave', this.onPointerLeave)
    this.el.removeEventListener('pointercancel', this.onPointerLeave)
  }
}

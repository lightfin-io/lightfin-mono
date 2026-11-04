/**
 * Crosshair hover tracking (PLAN §8.2).
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
  private rect: DOMRect

  constructor(el: HTMLElement, handlers: CrosshairHandlers) {
    this.el = el
    this.handlers = handlers
    this.rect = el.getBoundingClientRect()

    el.addEventListener('pointermove', this.onPointerMove)
    el.addEventListener('pointerleave', this.onPointerLeave)
    el.addEventListener('pointercancel', this.onPointerLeave)
  }

  /** Re-measure the element rect; call when the container moves or resizes. */
  refreshRect(): void {
    this.rect = this.el.getBoundingClientRect()
  }

  private onPointerMove = (e: PointerEvent): void => {
    if (e.pointerType === 'touch') return
    this.handlers.onMove({
      x: e.clientX - this.rect.left,
      y: e.clientY - this.rect.top,
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

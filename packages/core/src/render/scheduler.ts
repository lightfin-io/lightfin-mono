/**
 * A single requestAnimationFrame-batched invalidation scheduler.
 *
 * Anything that wants to repaint marks a layer dirty; one rAF tick repaints
 * exactly the dirty layers, so rapid pan/zoom/live-tick bursts coalesce into
 * one paint per frame instead of N.
 */
export class FrameScheduler {
  private dirty = new Set<string>()
  private frame: number | null = null
  private readonly render: (layers: ReadonlySet<string>) => void

  constructor(render: (dirtyLayers: ReadonlySet<string>) => void) {
    this.render = render
  }

  /** Mark one or more layers dirty and ensure a frame is scheduled. */
  invalidate(...layers: string[]): void {
    for (const layer of layers) this.dirty.add(layer)
    if (this.frame === null) {
      this.frame = requestAnimationFrame(this.tick)
    }
  }

  private tick = (): void => {
    this.frame = null
    const batch = this.dirty
    this.dirty = new Set()
    this.render(batch)
  }

  /** Cancel any pending frame. Call on teardown. */
  dispose(): void {
    if (this.frame !== null) {
      cancelAnimationFrame(this.frame)
      this.frame = null
    }
    this.dirty.clear()
  }
}

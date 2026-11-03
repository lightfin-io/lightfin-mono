/**
 * Index-based time scale (PLAN §3, §8.1).
 *
 * The X axis is uniform bar spacing: time is a label mapped per index, never a
 * continuous time axis, so weekend/overnight gaps vanish for free and panning
 * math stays integer-friendly. The visible range is expressed as a fractional
 * `scrollIndex` (the logical index sitting at the left edge, x=0) plus a
 * `barWidth` in pixels — the fractional part gives smooth sub-bar panning.
 *
 *   centerX(index) = (index - scrollIndex + 0.5) * barWidth
 *
 * i.e. bar `index` occupies the pixel span
 *   [(index - scrollIndex) * barWidth, (index - scrollIndex + 1) * barWidth]
 * and is drawn centered in it.
 */
export class TimeScale {
  /** Pixels per bar slot. */
  barWidth: number
  /** Fractional logical index at the left edge (x = 0). */
  scrollIndex: number

  constructor(barWidth = 8, scrollIndex = 0) {
    this.barWidth = barWidth
    this.scrollIndex = scrollIndex
  }

  /** Center x (px) of a bar slot. */
  indexToX(index: number): number {
    return (index - this.scrollIndex + 0.5) * this.barWidth
  }

  /** Fractional logical index whose slot center is at pixel x. */
  xToIndex(x: number): number {
    return this.scrollIndex + x / this.barWidth - 0.5
  }

  /** Nearest whole bar index to pixel x. */
  nearestIndex(x: number): number {
    return Math.round(this.xToIndex(x))
  }

  /**
   * Fractional logical index range covering the plot `[0, width]`. Callers
   * floor/ceil and clamp against the data to get the draw window.
   */
  visibleRange(width: number): { from: number; to: number } {
    return {
      from: this.xToIndex(0),
      to: this.xToIndex(width),
    }
  }

  /** Pan by a pixel delta (drag). Positive dx moves the view left in time. */
  panByPixels(dx: number): void {
    this.scrollIndex -= dx / this.barWidth
  }

  /**
   * Zoom by scaling `barWidth` by `factor`, keeping the bar under `anchorX`
   * pinned to that pixel (PLAN §8.1). This is what makes wheel/pinch zoom feel
   * anchored instead of sliding the data sideways.
   */
  zoom(factor: number, anchorX: number): void {
    const anchorIndex = this.xToIndex(anchorX)
    this.barWidth *= factor
    // Re-solve scrollIndex so anchorIndex stays at anchorX.
    this.scrollIndex = anchorIndex - anchorX / this.barWidth + 0.5
  }
}

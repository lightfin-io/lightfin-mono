/**
 * Linear price scale (PLAN §7). Maps a price domain `[min, max]` to vertical
 * pixels, y growing downward so the higher price sits at the top (y = 0).
 *
 * Autoscaling to the visible range's min/max (with margin) is a separate step
 * the chart drives each frame via {@link autoScale}; the scale itself just
 * holds the domain and does the mapping.
 */
export class PriceScale {
  min: number
  max: number
  /** Fraction of the domain kept as empty margin above and below the data. */
  marginRatio: number
  /**
   * Pixel-space insets (fraction of plot height) reserved at the top and bottom
   * of the plot, so the price domain maps only into the band between them. The
   * chart uses the bottom inset to lift candles clear of the volume histogram
   * (PLAN §7) — it occupies the bottom slice, so prices shouldn't draw over it.
   * Both default to 0 (domain fills the full height).
   */
  topMargin = 0
  bottomMargin = 0

  constructor(min = 0, max = 1, marginRatio = 0.1) {
    this.min = min
    this.max = max
    this.marginRatio = marginRatio
  }

  /** Usable vertical band in px after the top/bottom insets; at least 1px. */
  private usable(height: number): number {
    return Math.max(1, height * (1 - this.topMargin - this.bottomMargin))
  }

  priceToY(price: number, height: number): number {
    const span = this.max - this.min || 1
    return (
      height * this.topMargin +
      (1 - (price - this.min) / span) * this.usable(height)
    )
  }

  yToPrice(y: number, height: number): number {
    const span = this.max - this.min || 1
    return (
      this.min +
      (1 - (y - height * this.topMargin) / this.usable(height)) * span
    )
  }

  /**
   * Set the domain to `[low, high]` padded by `marginRatio` on each side. A
   * degenerate (flat) range is given a small symmetric band so the line/candle
   * doesn't collapse onto a single pixel.
   */
  autoScale(low: number, high: number): void {
    if (!Number.isFinite(low) || !Number.isFinite(high)) return
    let span = high - low
    if (span <= 0) {
      const pad = Math.abs(high) > 0 ? Math.abs(high) * 0.1 : 1
      this.min = low - pad
      this.max = high + pad
      return
    }
    const margin = span * this.marginRatio
    this.min = low - margin
    this.max = high + margin
  }
}

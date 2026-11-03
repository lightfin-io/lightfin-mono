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

  constructor(min = 0, max = 1, marginRatio = 0.1) {
    this.min = min
    this.max = max
    this.marginRatio = marginRatio
  }

  priceToY(price: number, height: number): number {
    const span = this.max - this.min || 1
    return height * (1 - (price - this.min) / span)
  }

  yToPrice(y: number, height: number): number {
    const span = this.max - this.min || 1
    return this.min + (1 - y / height) * span
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

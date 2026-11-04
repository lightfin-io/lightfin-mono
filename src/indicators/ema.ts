import { BaseCalc, meanClose } from './helpers'
import type { BarReader, IndicatorDefinition } from './types'

/**
 * Exponential Moving Average (PLAN §8.4). Seeded with an SMA over the first
 * `period` closes, then recursively weighted by `k = 2/(period+1)`. Drawn as
 * one overlay line. Its own subpath module:
 * `import('lightfin-web-chart/indicators/ema')`.
 */
export interface EmaOptions {
  period: number
  color: string
  lineWidth: number
}

const KEY = 'ema'

class EmaCalc extends BaseCalc {
  private readonly period: number
  private readonly k: number
  constructor(period: number) {
    super([KEY])
    this.period = period
    this.k = 2 / (period + 1)
  }

  protected computeAt(reader: BarReader, index: number): void {
    const offset = index - reader.firstIndex
    if (offset < this.period - 1) {
      this.set(KEY, index, NaN)
    } else if (offset === this.period - 1) {
      // Seed the recursion with the SMA of the first full window.
      this.set(KEY, index, meanClose(reader, index, this.period))
    } else {
      const prev = this.prior(KEY, index - 1)
      this.set(KEY, index, reader.close(index) * this.k + prev * (1 - this.k))
    }
  }
}

const definition: IndicatorDefinition<EmaOptions> = {
  name: 'EMA',
  overlay: true,
  defaultOptions: { period: 20, color: '#ff6d00', lineWidth: 1.5 },
  plots: o => [{ key: KEY, color: o.color, lineWidth: o.lineWidth }],
  create: o => new EmaCalc(o.period),
}

export default definition

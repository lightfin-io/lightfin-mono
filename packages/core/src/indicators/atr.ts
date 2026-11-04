import { BaseCalc } from './helpers'
import type { BarReader, IndicatorDefinition } from './types'

/**
 * Average True Range (PLAN §8.4), Wilder's smoothing — a volatility measure in
 * price units. True Range is the greatest of the current bar's range and its
 * gaps from the prior close; ATR is the Wilder-smoothed mean of that over
 * `period` bars. A pane indicator, autoscaled to its own values (no fixed
 * range). Its own subpath module: `import('@lightfin/core/indicators/atr')`.
 */
export interface AtrOptions {
  period: number
  color: string
  lineWidth: number
}

const ATR = 'atr'

class AtrCalc extends BaseCalc {
  private readonly period: number
  constructor(period: number) {
    super([ATR])
    this.period = period
  }

  /** The first bar has no prior close, so its TR is just the bar's range. */
  private trueRange(reader: BarReader, index: number): number {
    const high = reader.high(index)
    const low = reader.low(index)
    if (index === reader.firstIndex) return high - low
    const prevClose = reader.close(index - 1)
    return Math.max(
      high - low,
      Math.abs(high - prevClose),
      Math.abs(low - prevClose),
    )
  }

  protected computeAt(reader: BarReader, index: number): void {
    const offset = index - reader.firstIndex
    const p = this.period
    if (offset < p - 1) {
      this.set(ATR, index, NaN)
    } else if (offset === p - 1) {
      // Seed the recursion with a simple average of the first `period` TRs.
      let sum = 0
      for (let i = reader.firstIndex; i <= index; i++) {
        sum += this.trueRange(reader, i)
      }
      this.set(ATR, index, sum / p)
    } else {
      const prev = this.prior(ATR, index - 1)
      this.set(ATR, index, (prev * (p - 1) + this.trueRange(reader, index)) / p)
    }
  }
}

const definition: IndicatorDefinition<AtrOptions> = {
  name: 'ATR',
  overlay: false,
  colorKeys: ['color'],
  defaultOptions: { period: 14, color: '#f23645', lineWidth: 1.5 },
  params: o => [o.period],
  plots: o => [{ key: ATR, color: o.color, lineWidth: o.lineWidth }],
  create: o => new AtrCalc(o.period),
}

export default definition

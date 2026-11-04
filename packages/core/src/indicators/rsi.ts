import { BaseCalc } from './helpers'
import type { BarReader, IndicatorDefinition } from './types'

/**
 * Relative Strength Index (PLAN §8.4), Wilder's smoothing. A pane indicator on
 * a fixed 0–100 scale with overbought/oversold reference lines. Its own subpath
 * module: `import('@lightfin/core/indicators/rsi')`.
 */
export interface RsiOptions {
  period: number
  color: string
  lineWidth: number
  overbought: number
  oversold: number
  levelColor: string
}

const RSI = 'rsi'
// Internal (non-plotted) running averages used by Wilder's recursion.
const AVG_GAIN = 'avgGain'
const AVG_LOSS = 'avgLoss'

class RsiCalc extends BaseCalc {
  private readonly period: number
  constructor(period: number) {
    super([RSI, AVG_GAIN, AVG_LOSS])
    this.period = period
  }

  protected computeAt(reader: BarReader, index: number): void {
    const p = this.period
    const offset = index - reader.firstIndex
    if (offset === 0) {
      this.set(RSI, index, NaN)
      this.set(AVG_GAIN, index, NaN)
      this.set(AVG_LOSS, index, NaN)
      return
    }
    const change = reader.close(index) - reader.close(index - 1)
    const gain = change > 0 ? change : 0
    const loss = change < 0 ? -change : 0

    if (offset < p) {
      this.set(RSI, index, NaN)
      this.set(AVG_GAIN, index, NaN)
      this.set(AVG_LOSS, index, NaN)
      return
    }

    let avgGain: number
    let avgLoss: number
    if (offset === p) {
      // Seed: simple average of the first `period` price changes.
      let sumGain = 0
      let sumLoss = 0
      for (let i = index - p + 1; i <= index; i++) {
        const c = reader.close(i) - reader.close(i - 1)
        if (c > 0) sumGain += c
        else sumLoss += -c
      }
      avgGain = sumGain / p
      avgLoss = sumLoss / p
    } else {
      avgGain = (this.prior(AVG_GAIN, index - 1) * (p - 1) + gain) / p
      avgLoss = (this.prior(AVG_LOSS, index - 1) * (p - 1) + loss) / p
    }

    this.set(AVG_GAIN, index, avgGain)
    this.set(AVG_LOSS, index, avgLoss)
    const rsi = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss)
    this.set(RSI, index, rsi)
  }
}

const definition: IndicatorDefinition<RsiOptions> = {
  name: 'RSI',
  overlay: false,
  defaultOptions: {
    period: 14,
    color: '#7e57c2',
    lineWidth: 1.5,
    overbought: 70,
    oversold: 30,
    levelColor: 'rgba(120, 134, 150, 0.6)',
  },
  params: o => [o.period],
  plots: o => [{ key: RSI, color: o.color, lineWidth: o.lineWidth }],
  fixedRange: () => ({ min: 0, max: 100 }),
  levels: o => [
    { value: o.overbought, color: o.levelColor },
    { value: o.oversold, color: o.levelColor },
  ],
  create: o => new RsiCalc(o.period),
}

export default definition

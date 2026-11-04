import { BaseCalc } from './helpers'
import type { BarReader, IndicatorDefinition } from './types'

/**
 * Stochastic Oscillator (PLAN §8.4). Raw %K places the close within the
 * high/low range of the last `kPeriod` bars (0–100); %K is that smoothed over
 * `kSmooth` bars (`kSmooth: 1` is the fast stochastic), and %D is an SMA of %K
 * over `dPeriod`. A pane indicator on a fixed 0–100 scale with
 * overbought/oversold lines. Its own subpath module:
 * `import('@lightfin/core/indicators/stochastic')`.
 */
export interface StochasticOptions {
  kPeriod: number
  kSmooth: number
  dPeriod: number
  kColor: string
  dColor: string
  lineWidth: number
  overbought: number
  oversold: number
  levelColor: string
}

const K = 'k'
const D = 'd'
// Internal (non-plotted) raw %K that %K smooths.
const RAW_K = 'rawK'

class StochasticCalc extends BaseCalc {
  private readonly kPeriod: number
  private readonly kSmooth: number
  private readonly dPeriod: number

  constructor(kPeriod: number, kSmooth: number, dPeriod: number) {
    super([K, D, RAW_K])
    this.kPeriod = kPeriod
    this.kSmooth = kSmooth
    this.dPeriod = dPeriod
  }

  /** Close's position in the high/low range over the last `kPeriod` bars. */
  private rawK(reader: BarReader, index: number): number {
    const start = index - this.kPeriod + 1
    if (start < reader.firstIndex) return NaN
    let highest = -Infinity
    let lowest = Infinity
    for (let i = start; i <= index; i++) {
      highest = Math.max(highest, reader.high(i))
      lowest = Math.min(lowest, reader.low(i))
    }
    const range = highest - lowest
    // A flat window has no range to position within; report the midpoint.
    return range === 0 ? 50 : (100 * (reader.close(index) - lowest)) / range
  }

  /** SMA of an already-computed column over `period` bars ending at `index`. */
  private movingAvg(
    reader: BarReader,
    key: string,
    index: number,
    period: number,
  ): number {
    const start = index - period + 1
    if (start < reader.firstIndex) return NaN
    let sum = 0
    for (let i = start; i <= index; i++) {
      const v = this.value(key, i)
      if (!Number.isFinite(v)) return NaN
      sum += v
    }
    return sum / period
  }

  protected computeAt(reader: BarReader, index: number): void {
    // Order matters: each step only reads columns already set for this index.
    this.set(RAW_K, index, this.rawK(reader, index))
    this.set(K, index, this.movingAvg(reader, RAW_K, index, this.kSmooth))
    this.set(D, index, this.movingAvg(reader, K, index, this.dPeriod))
  }
}

const definition: IndicatorDefinition<StochasticOptions> = {
  name: 'Stoch',
  overlay: false,
  defaultOptions: {
    kPeriod: 14,
    kSmooth: 1,
    dPeriod: 3,
    kColor: '#2962ff',
    dColor: '#ff6d00',
    lineWidth: 1.5,
    overbought: 80,
    oversold: 20,
    levelColor: 'rgba(120, 134, 150, 0.6)',
  },
  params: o => [o.kPeriod, o.kSmooth, o.dPeriod],
  plots: o => [
    { key: K, color: o.kColor, lineWidth: o.lineWidth },
    { key: D, color: o.dColor, lineWidth: o.lineWidth },
  ],
  fixedRange: () => ({ min: 0, max: 100 }),
  levels: o => [
    { value: o.overbought, color: o.levelColor },
    { value: o.oversold, color: o.levelColor },
  ],
  create: o => new StochasticCalc(o.kPeriod, o.kSmooth, o.dPeriod),
}

export default definition

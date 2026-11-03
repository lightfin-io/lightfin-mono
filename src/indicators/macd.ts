import { BaseCalc, meanClose } from './helpers.ts'
import type { BarReader, IndicatorDefinition } from './types.ts'

/**
 * MACD (PLAN §8.4): the difference of a fast and slow EMA of close, a signal
 * EMA of that difference, and their histogram. A pane indicator (autoscaled,
 * with a zero line). Its own subpath module:
 * `import('lightfin-web-chart/indicators/macd')`.
 */
export interface MacdOptions {
  fastPeriod: number
  slowPeriod: number
  signalPeriod: number
  macdColor: string
  signalColor: string
  histUpColor: string
  histDownColor: string
  lineWidth: number
}

const MACD = 'macd'
const SIGNAL = 'signal'
const HIST = 'hist'
// Internal (non-plotted) EMAs of close feeding the MACD line.
const EMA_FAST = 'emaFast'
const EMA_SLOW = 'emaSlow'

class MacdCalc extends BaseCalc {
  private readonly fast: number
  private readonly slow: number
  private readonly signal: number
  private readonly kFast: number
  private readonly kSlow: number
  private readonly kSignal: number

  constructor(fast: number, slow: number, signal: number) {
    super([MACD, SIGNAL, HIST, EMA_FAST, EMA_SLOW])
    this.fast = fast
    this.slow = slow
    this.signal = signal
    this.kFast = 2 / (fast + 1)
    this.kSlow = 2 / (slow + 1)
    this.kSignal = 2 / (signal + 1)
  }

  /** One EMA-of-close step for a stored column, seeded by SMA at its first full window. */
  private emaStep(
    reader: BarReader,
    index: number,
    key: string,
    period: number,
    k: number,
  ): number {
    const offset = index - reader.firstIndex
    if (offset < period - 1) return NaN
    if (offset === period - 1) return meanClose(reader, index, period)
    return reader.close(index) * k + this.prior(key, index - 1) * (1 - k)
  }

  protected computeAt(reader: BarReader, index: number): void {
    const offset = index - reader.firstIndex
    const emaFast = this.emaStep(reader, index, EMA_FAST, this.fast, this.kFast)
    const emaSlow = this.emaStep(reader, index, EMA_SLOW, this.slow, this.kSlow)
    this.set(EMA_FAST, index, emaFast)
    this.set(EMA_SLOW, index, emaSlow)

    const macd = offset >= this.slow - 1 ? emaFast - emaSlow : NaN
    this.set(MACD, index, macd)

    // Signal is an EMA of the MACD line, so it warms up `signal` bars after the
    // MACD line first appears.
    const firstMacd = this.slow - 1
    const firstSignal = firstMacd + this.signal - 1
    let signal: number
    if (offset < firstSignal) {
      signal = NaN
    } else if (offset === firstSignal) {
      let sum = 0
      for (let i = index - this.signal + 1; i <= index; i++) {
        sum += this.value(MACD, i)
      }
      signal = sum / this.signal
    } else {
      signal =
        macd * this.kSignal + this.prior(SIGNAL, index - 1) * (1 - this.kSignal)
    }
    this.set(SIGNAL, index, signal)
    this.set(HIST, index, Number.isFinite(signal) ? macd - signal : NaN)
  }
}

const definition: IndicatorDefinition<MacdOptions> = {
  name: 'MACD',
  overlay: false,
  defaultOptions: {
    fastPeriod: 12,
    slowPeriod: 26,
    signalPeriod: 9,
    macdColor: '#2962ff',
    signalColor: '#ff6d00',
    histUpColor: 'rgba(38, 166, 154, 0.5)',
    histDownColor: 'rgba(239, 83, 80, 0.5)',
    lineWidth: 1.5,
  },
  plots: o => [
    {
      key: HIST,
      type: 'histogram',
      color: o.histUpColor,
      negativeColor: o.histDownColor,
    },
    { key: MACD, color: o.macdColor, lineWidth: o.lineWidth },
    { key: SIGNAL, color: o.signalColor, lineWidth: o.lineWidth },
  ],
  levels: () => [
    { value: 0, color: 'rgba(120, 134, 150, 0.5)', dashed: false },
  ],
  create: o => new MacdCalc(o.fastPeriod, o.slowPeriod, o.signalPeriod),
}

export default definition

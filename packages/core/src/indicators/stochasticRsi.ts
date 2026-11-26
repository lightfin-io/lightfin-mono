import { RSI, RsiCalc } from './rsiCalc'
import type { BarReader, IndicatorDefinition } from './types'

/** Stochastic RSI plots smoothed %K and %D on a 0–100 scale. */
export interface StochasticRsiOptions {
  rsiPeriod: number
  /** Lookback for the range of RSI values. */
  stochPeriod: number
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
const RAW_K = 'rawK'

class StochasticRsiCalc extends RsiCalc {
  private readonly stochPeriod: number
  private readonly kSmooth: number
  private readonly dPeriod: number

  constructor(
    rsiPeriod: number,
    stochPeriod: number,
    kSmooth: number,
    dPeriod: number,
  ) {
    super(rsiPeriod, [RAW_K, K, D])
    this.stochPeriod = stochPeriod
    this.kSmooth = kSmooth
    this.dPeriod = dPeriod
  }

  private rawK(index: number): number {
    let highest = -Infinity
    let lowest = Infinity
    for (let i = index - this.stochPeriod + 1; i <= index; i++) {
      const rsi = this.value(RSI, i)
      if (!Number.isFinite(rsi)) return NaN
      highest = Math.max(highest, rsi)
      lowest = Math.min(lowest, rsi)
    }
    const range = highest - lowest
    // Use the midpoint when every RSI in the window is the same.
    return range === 0 ? 50 : 100 * ((this.value(RSI, index) - lowest) / range)
  }

  protected computeAt(reader: BarReader, index: number): void {
    super.computeAt(reader, index)
    this.set(RAW_K, index, this.rawK(index))
    this.set(K, index, this.meanPlot(RAW_K, index, this.kSmooth))
    this.set(D, index, this.meanPlot(K, index, this.dPeriod))
  }
}

const definition: IndicatorDefinition<StochasticRsiOptions> = {
  name: 'Stoch RSI',
  overlay: false,
  colorKeys: ['kColor', 'dColor'],
  defaultOptions: {
    rsiPeriod: 14,
    stochPeriod: 14,
    kSmooth: 3,
    dPeriod: 3,
    kColor: '#2962ff',
    dColor: '#ff6d00',
    lineWidth: 1.5,
    overbought: 80,
    oversold: 20,
    levelColor: 'rgba(120, 134, 150, 0.6)',
  },
  params: o => [o.rsiPeriod, o.stochPeriod, o.kSmooth, o.dPeriod],
  plots: o => [
    { key: K, color: o.kColor, lineWidth: o.lineWidth },
    { key: D, color: o.dColor, lineWidth: o.lineWidth },
  ],
  // Leave room for the lines when they reach either extreme.
  fixedRange: () => ({ min: -4, max: 104 }),
  levels: o => [
    { value: o.overbought, color: o.levelColor },
    { value: o.oversold, color: o.levelColor },
  ],
  create: o =>
    new StochasticRsiCalc(o.rsiPeriod, o.stochPeriod, o.kSmooth, o.dPeriod),
}

export default definition

import { BaseCalc, highestHigh, lowestLow, trueRange } from './helpers'
import type { BarReader, IndicatorDefinition } from './types'

/** Choppiness Index compares the sum of true ranges with the window's true price span. */
export interface ChoppinessOptions {
  /** Number of bars in the window, at least two. */
  period: number
  color: string
  lineWidth: number
  upperLevel: number
  lowerLevel: number
  levelColor: string
}

const KEY = 'chop'

class ChoppinessCalc extends BaseCalc {
  private readonly period: number
  private readonly logPeriod: number

  constructor(period: number) {
    super([KEY])
    this.period = period
    this.logPeriod = Math.log10(period)
  }

  protected computeAt(reader: BarReader, index: number): void {
    const start = index - this.period + 1
    if (this.period < 2 || start < reader.firstIndex) return

    let high = highestHigh(reader, index, this.period)
    let low = lowestLow(reader, index, this.period)
    // The close entering the window can extend the first bar's true range.
    if (start > reader.firstIndex) {
      const previousClose = reader.close(start - 1)
      high = Math.max(high, previousClose)
      low = Math.min(low, previousClose)
    }

    let totalRange = 0
    for (let i = start; i <= index; i++) totalRange += trueRange(reader, i)

    // A flat window has no directional movement and reads as fully choppy.
    const span = high - low
    const value =
      span === 0 ? 100 : (100 * Math.log10(totalRange / span)) / this.logPeriod
    this.set(KEY, index, value)
  }
}

const definition: IndicatorDefinition<ChoppinessOptions> = {
  name: 'CHOP',
  overlay: false,
  colorKeys: ['color'],
  defaultOptions: {
    period: 14,
    color: '#ff6d00',
    lineWidth: 1.5,
    upperLevel: 61.8,
    lowerLevel: 38.2,
    levelColor: 'rgba(120, 134, 150, 0.6)',
  },
  params: o => [o.period],
  plots: o => [{ key: KEY, color: o.color, lineWidth: o.lineWidth }],
  fixedRange: () => ({ min: -4, max: 104 }),
  levels: o => [
    { value: o.upperLevel, color: o.levelColor },
    { value: o.lowerLevel, color: o.levelColor },
  ],
  create: o => new ChoppinessCalc(o.period),
}

export default definition

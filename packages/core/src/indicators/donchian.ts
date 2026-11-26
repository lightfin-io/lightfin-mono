import { BaseCalc, highestHigh, lowestLow } from './helpers'
import type { BarReader, IndicatorDefinition } from './types'

/** Donchian Channels plot the rolling high, low, and their midpoint. */
export interface DonchianOptions {
  /** Number of bars in the window, including the current bar. */
  period: number
  color: string
  /** Fill color for the channel region (should be translucent). */
  fillColor: string
  lineWidth: number
}

const UPPER = 'upper'
const MIDDLE = 'middle'
const LOWER = 'lower'

class DonchianCalc extends BaseCalc {
  private readonly period: number

  constructor(period: number) {
    super([UPPER, MIDDLE, LOWER])
    this.period = period
  }

  protected computeAt(reader: BarReader, index: number): void {
    if (index - reader.firstIndex + 1 < this.period) return
    const upper = highestHigh(reader, index, this.period)
    const lower = lowestLow(reader, index, this.period)
    this.set(UPPER, index, upper)
    this.set(MIDDLE, index, (upper + lower) / 2)
    this.set(LOWER, index, lower)
  }
}

const definition: IndicatorDefinition<DonchianOptions> = {
  name: 'Donchian',
  overlay: true,
  colorKeys: ['color'],
  defaultOptions: {
    period: 20,
    color: '#2962ff',
    fillColor: 'rgba(41, 98, 255, 0.08)',
    lineWidth: 1,
  },
  params: o => [o.period],
  plots: o => [
    { key: UPPER, color: o.color, lineWidth: o.lineWidth },
    { key: MIDDLE, color: o.color, lineWidth: o.lineWidth },
    { key: LOWER, color: o.color, lineWidth: o.lineWidth },
  ],
  fills: o => [{ upper: UPPER, lower: LOWER, color: o.fillColor }],
  create: o => new DonchianCalc(o.period),
}

export default definition

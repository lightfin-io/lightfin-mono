import { BaseCalc, highestHigh, lowestLow } from './helpers'
import type { BarReader, IndicatorDefinition } from './types'

/**
 * Williams %R (PLAN §8.4) — where the close sits within the high/low range of
 * the last `period` bars, expressed on a 0 to −100 scale (0 at the top of the
 * range, −100 at the bottom). A momentum pane indicator with overbought
 * (−20) / oversold (−80) reference lines. Its own subpath module:
 * `import('@lightfin/core/indicators/williamsR')`.
 */
export interface WilliamsROptions {
  period: number
  color: string
  lineWidth: number
  overbought: number
  oversold: number
  levelColor: string
}

const KEY = 'williamsR'

class WilliamsRCalc extends BaseCalc {
  private readonly period: number
  constructor(period: number) {
    super([KEY])
    this.period = period
  }

  protected computeAt(reader: BarReader, index: number): void {
    if (index - reader.firstIndex < this.period - 1) {
      this.set(KEY, index, NaN)
      return
    }
    const hi = highestHigh(reader, index, this.period)
    const lo = lowestLow(reader, index, this.period)
    const range = hi - lo
    // A flat window has no range to position within; report the midpoint.
    const r = range === 0 ? -50 : (-100 * (hi - reader.close(index))) / range
    this.set(KEY, index, r)
  }
}

const definition: IndicatorDefinition<WilliamsROptions> = {
  name: 'Williams %R',
  overlay: false,
  colorKeys: ['color'],
  defaultOptions: {
    period: 14,
    color: '#7e57c2',
    lineWidth: 1.5,
    overbought: -20,
    oversold: -80,
    levelColor: 'rgba(120, 134, 150, 0.6)',
  },
  params: o => [o.period],
  plots: o => [{ key: KEY, color: o.color, lineWidth: o.lineWidth }],
  // %R pegs at the 0 / −100 extremes, so pad the domain past them a little to
  // keep the line off the pane's edges.
  fixedRange: () => ({ min: -104, max: 4 }),
  levels: o => [
    { value: o.overbought, color: o.levelColor },
    { value: o.oversold, color: o.levelColor },
  ],
  create: o => new WilliamsRCalc(o.period),
}

export default definition

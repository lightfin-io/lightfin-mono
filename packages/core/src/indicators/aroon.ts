import { BaseCalc } from './helpers'
import type { BarReader, IndicatorDefinition } from './types'

/**
 * Aroon Up and Aroon Down. Each scores how recently the window made its
 * highest high or lowest low, from 0 to 100. The window runs from `period`
 * bars back through the current bar, so a high on this bar scores 100 and a
 * high `period` bars ago scores 0. Ties take the most recent bar. A pane
 * indicator. Its own subpath module:
 * `import('@lightfin/core/indicators/aroon')`.
 */
export interface AroonOptions {
  period: number
  upColor: string
  downColor: string
  lineWidth: number
  upperLevel: number
  lowerLevel: number
  levelColor: string
}

const UP = 'up'
const DOWN = 'down'

class AroonCalc extends BaseCalc {
  private readonly period: number

  constructor(period: number) {
    super([UP, DOWN])
    this.period = period
  }

  protected computeAt(reader: BarReader, index: number): void {
    if (this.period < 1 || index - reader.firstIndex < this.period) {
      this.set(UP, index, NaN)
      this.set(DOWN, index, NaN)
      return
    }

    const start = index - this.period
    let highAt = start
    let lowAt = start
    for (let i = start + 1; i <= index; i++) {
      // `>=` / `<=` keep the latest bar when the extreme ties.
      if (reader.high(i) >= reader.high(highAt)) highAt = i
      if (reader.low(i) <= reader.low(lowAt)) lowAt = i
    }
    const period = this.period
    this.set(UP, index, (100 * (period - (index - highAt))) / period)
    this.set(DOWN, index, (100 * (period - (index - lowAt))) / period)
  }
}

const definition: IndicatorDefinition<AroonOptions> = {
  name: 'Aroon',
  overlay: false,
  colorKeys: ['upColor', 'downColor'],
  defaultOptions: {
    period: 25,
    upColor: '#26a69a',
    downColor: '#ef5350',
    lineWidth: 1.5,
    upperLevel: 70,
    lowerLevel: 30,
    levelColor: 'rgba(120, 134, 150, 0.6)',
  },
  params: o => [o.period],
  plots: o => [
    { key: UP, color: o.upColor, lineWidth: o.lineWidth },
    { key: DOWN, color: o.downColor, lineWidth: o.lineWidth },
  ],
  fixedRange: () => ({ min: -4, max: 104 }),
  levels: o => [
    { value: o.upperLevel, color: o.levelColor },
    { value: o.lowerLevel, color: o.levelColor },
  ],
  create: o => new AroonCalc(o.period),
}

export default definition

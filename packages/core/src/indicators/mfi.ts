import { BaseCalc, typicalPrice } from './helpers'
import type { BarReader, IndicatorDefinition } from './types'

/** Money Flow Index compares positive and negative volume-weighted price flows. */
export interface MfiOptions {
  period: number
  color: string
  lineWidth: number
  overbought: number
  oversold: number
  levelColor: string
}

const KEY = 'mfi'

class MfiCalc extends BaseCalc {
  private readonly period: number

  constructor(period: number) {
    super([KEY])
    this.period = period
  }

  protected computeAt(reader: BarReader, index: number): void {
    const start = index - this.period + 1
    if (start <= reader.firstIndex) return

    let previousPrice = typicalPrice(reader, start - 1)
    let positiveFlow = 0
    let negativeFlow = 0
    let hasVolume = false
    for (let i = start; i <= index; i++) {
      const volume = reader.volume(i)
      if (!Number.isFinite(volume) || volume < 0) {
        this.set(KEY, index, NaN)
        return
      }
      const price = typicalPrice(reader, i)
      // Price change determines the direction, even on instruments with signed prices.
      const flow = Math.abs(price) * volume
      if (price > previousPrice) positiveFlow += flow
      if (price < previousPrice) negativeFlow += flow
      previousPrice = price
      if (volume > 0) hasVolume = true
    }

    const totalFlow = positiveFlow + negativeFlow
    // A window with volume and no directional flow reads neutral.
    const value = totalFlow > 0 ? 100 * (positiveFlow / totalFlow) : 50
    this.set(KEY, index, hasVolume ? value : NaN)
  }
}

const definition: IndicatorDefinition<MfiOptions> = {
  name: 'MFI',
  overlay: false,
  colorKeys: ['color'],
  defaultOptions: {
    period: 14,
    color: '#7e57c2',
    lineWidth: 1.5,
    overbought: 80,
    oversold: 20,
    levelColor: 'rgba(120, 134, 150, 0.6)',
  },
  params: o => [o.period],
  plots: o => [{ key: KEY, color: o.color, lineWidth: o.lineWidth }],
  fixedRange: () => ({ min: -4, max: 104 }),
  levels: o => [
    { value: o.overbought, color: o.levelColor },
    { value: o.oversold, color: o.levelColor },
  ],
  create: o => new MfiCalc(o.period),
}

export default definition

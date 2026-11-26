import { BaseCalc } from './helpers'
import type { BarReader, IndicatorDefinition } from './types'

/** Volume-weighted mean of the closing prices over the last `period` bars. */
export interface VwmaOptions {
  period: number
  color: string
  lineWidth: number
}

const KEY = 'vwma'

class VwmaCalc extends BaseCalc {
  private readonly period: number

  constructor(period: number) {
    super([KEY])
    this.period = period
  }

  protected computeAt(reader: BarReader, index: number): void {
    const start = index - this.period + 1
    if (start < reader.firstIndex) return

    let weightedPrice = 0
    let totalVolume = 0
    for (let i = start; i <= index; i++) {
      const volume = reader.volume(i)
      if (!Number.isFinite(volume) || volume < 0) {
        this.set(KEY, index, NaN)
        return
      }
      weightedPrice += reader.close(i) * volume
      totalVolume += volume
    }
    this.set(KEY, index, totalVolume > 0 ? weightedPrice / totalVolume : NaN)
  }
}

const definition: IndicatorDefinition<VwmaOptions> = {
  name: 'VWMA',
  overlay: true,
  colorKeys: ['color'],
  defaultOptions: { period: 20, color: '#26a69a', lineWidth: 1.5 },
  params: o => [o.period],
  plots: o => [{ key: KEY, color: o.color, lineWidth: o.lineWidth }],
  create: o => new VwmaCalc(o.period),
}

export default definition

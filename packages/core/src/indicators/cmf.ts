import { BaseCalc } from './helpers'
import type { BarReader, IndicatorDefinition } from './types'

/**
 * Chaikin Money Flow. Sums each bar's close-location value times its
 * volume over the window, then divides by the window's volume, so the result
 * sits between −1 and 1: positive when closes finish near the highs. A pane
 * indicator with a zero line. A window with missing volume, negative volume,
 * or zero total volume is a gap. Its own subpath module:
 * `import('@lightfin/core/indicators/cmf')`.
 */
export interface CmfOptions {
  period: number
  color: string
  lineWidth: number
  levelColor: string
}

const KEY = 'cmf'

class CmfCalc extends BaseCalc {
  private readonly period: number

  constructor(period: number) {
    super([KEY])
    this.period = period
  }

  protected computeAt(reader: BarReader, index: number): void {
    const start = index - this.period + 1
    if (start < reader.firstIndex) {
      this.set(KEY, index, NaN)
      return
    }

    let flow = 0
    let volume = 0
    for (let i = start; i <= index; i++) {
      const barVolume = reader.volume(i)
      if (!Number.isFinite(barVolume) || barVolume < 0) {
        this.set(KEY, index, NaN)
        return
      }
      const high = reader.high(i)
      const low = reader.low(i)
      const range = high - low
      // A flat bar has no location inside the range; it adds volume only.
      const clv = range === 0 ? 0 : (2 * reader.close(i) - low - high) / range
      flow += clv * barVolume
      volume += barVolume
    }
    this.set(KEY, index, volume > 0 ? flow / volume : NaN)
  }
}

const definition: IndicatorDefinition<CmfOptions> = {
  name: 'CMF',
  overlay: false,
  colorKeys: ['color'],
  defaultOptions: {
    period: 20,
    color: '#2962ff',
    lineWidth: 1.5,
    levelColor: 'rgba(120, 134, 150, 0.5)',
  },
  params: o => [o.period],
  plots: o => [{ key: KEY, color: o.color, lineWidth: o.lineWidth }],
  levels: o => [{ value: 0, color: o.levelColor, dashed: false }],
  create: o => new CmfCalc(o.period),
}

export default definition

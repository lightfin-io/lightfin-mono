import { BaseCalc, typicalPrice } from './helpers'
import type { BarReader, IndicatorDefinition } from './types'

/**
 * Commodity Channel Index — how far the typical price sits from
 * its own moving average, scaled by its mean deviation. Oscillates around
 * zero; readings beyond ±100 flag unusually strong moves. A pane indicator,
 * autoscaled, with ±100 reference lines. Its own subpath module:
 * `import('@lightfin/core/indicators/cci')`.
 */
export interface CciOptions {
  period: number
  color: string
  lineWidth: number
  levelColor: string
}

const KEY = 'cci'
// Lambert's constant: scales the mean deviation so ~70–80% of values fall
// within ±100.
const SCALE = 0.015

class CciCalc extends BaseCalc {
  private readonly period: number
  constructor(period: number) {
    super([KEY])
    this.period = period
  }

  protected computeAt(reader: BarReader, index: number): void {
    const p = this.period
    if (index - reader.firstIndex < p - 1) {
      this.set(KEY, index, NaN)
      return
    }
    let sum = 0
    for (let j = index - p + 1; j <= index; j++) sum += typicalPrice(reader, j)
    const mean = sum / p

    let devSum = 0
    for (let j = index - p + 1; j <= index; j++) {
      devSum += Math.abs(typicalPrice(reader, j) - mean)
    }
    const meanDev = devSum / p

    const tp = typicalPrice(reader, index)
    // A zero mean deviation (a perfectly flat window) leaves CCI at zero.
    this.set(KEY, index, meanDev === 0 ? 0 : (tp - mean) / (SCALE * meanDev))
  }
}

const definition: IndicatorDefinition<CciOptions> = {
  name: 'CCI',
  overlay: false,
  colorKeys: ['color'],
  defaultOptions: {
    period: 20,
    color: '#2962ff',
    lineWidth: 1.5,
    levelColor: 'rgba(120, 134, 150, 0.6)',
  },
  params: o => [o.period],
  plots: o => [{ key: KEY, color: o.color, lineWidth: o.lineWidth }],
  levels: o => [
    { value: 100, color: o.levelColor },
    { value: -100, color: o.levelColor },
  ],
  create: o => new CciCalc(o.period),
}

export default definition

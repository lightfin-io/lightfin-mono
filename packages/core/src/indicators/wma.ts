import { BaseCalc } from './helpers'
import type { BarReader, IndicatorDefinition } from './types'

/**
 * Weighted Moving Average — like SMA, but the most recent close
 * carries the most weight (linear weights `1..period`), so it tracks price
 * more closely than a plain SMA. One overlay line on the main pane. Its own
 * subpath module: `import('@lightfin/core/indicators/wma')`.
 */
export interface WmaOptions {
  period: number
  color: string
  lineWidth: number
}

const KEY = 'wma'

class WmaCalc extends BaseCalc {
  private readonly period: number
  /** Sum of the linear weights `1 + 2 + … + period`. */
  private readonly weightSum: number
  constructor(period: number) {
    super([KEY])
    this.period = period
    this.weightSum = (period * (period + 1)) / 2
  }

  protected computeAt(reader: BarReader, index: number): void {
    if (index - reader.firstIndex < this.period - 1) {
      this.set(KEY, index, NaN)
      return
    }
    let weighted = 0
    // The oldest bar in the window gets weight 1, the newest weight `period`.
    for (let j = 0; j < this.period; j++) {
      weighted += reader.close(index - this.period + 1 + j) * (j + 1)
    }
    this.set(KEY, index, weighted / this.weightSum)
  }
}

const definition: IndicatorDefinition<WmaOptions> = {
  name: 'WMA',
  overlay: true,
  colorKeys: ['color'],
  defaultOptions: { period: 20, color: '#26a69a', lineWidth: 1.5 },
  params: o => [o.period],
  plots: o => [{ key: KEY, color: o.color, lineWidth: o.lineWidth }],
  create: o => new WmaCalc(o.period),
}

export default definition

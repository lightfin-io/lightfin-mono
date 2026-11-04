import { BaseCalc, meanClose } from './helpers'
import type { BarReader, IndicatorDefinition } from './types'

/**
 * Simple Moving Average (PLAN §8.4) — the mean of the last `period` closes,
 * drawn as one overlay line on the main pane. Ships as its own subpath module
 * so it only loads when used: `import('@lightfin/core/indicators/sma')`.
 */
export interface SmaOptions {
  period: number
  color: string
  lineWidth: number
}

const KEY = 'sma'

class SmaCalc extends BaseCalc {
  private readonly period: number
  constructor(period: number) {
    super([KEY])
    this.period = period
  }

  protected computeAt(reader: BarReader, index: number): void {
    const warm = index - reader.firstIndex < this.period - 1
    this.set(KEY, index, warm ? NaN : meanClose(reader, index, this.period))
  }
}

const definition: IndicatorDefinition<SmaOptions> = {
  name: 'SMA',
  overlay: true,
  colorKeys: ['color'],
  defaultOptions: { period: 20, color: '#2962ff', lineWidth: 1.5 },
  params: o => [o.period],
  plots: o => [{ key: KEY, color: o.color, lineWidth: o.lineWidth }],
  create: o => new SmaCalc(o.period),
}

export default definition

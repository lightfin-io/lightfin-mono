import { BaseCalc } from './helpers'
import type { BarReader, IndicatorDefinition } from './types'

/**
 * Rate of Change (PLAN §8.4) — the percent change in close over the last
 * `period` bars, a simple momentum oscillator swinging either side of zero. A
 * pane indicator, autoscaled, with a zero line. Its own subpath module:
 * `import('@lightfin/core/indicators/roc')`.
 */
export interface RocOptions {
  period: number
  color: string
  lineWidth: number
  levelColor: string
}

const KEY = 'roc'

class RocCalc extends BaseCalc {
  private readonly period: number
  constructor(period: number) {
    super([KEY])
    this.period = period
  }

  protected computeAt(reader: BarReader, index: number): void {
    if (index - reader.firstIndex < this.period) {
      this.set(KEY, index, NaN)
      return
    }
    const past = reader.close(index - this.period)
    // Guard the (degenerate) zero-price base rather than emit Infinity.
    const roc = past === 0 ? NaN : (100 * (reader.close(index) - past)) / past
    this.set(KEY, index, roc)
  }
}

const definition: IndicatorDefinition<RocOptions> = {
  name: 'ROC',
  overlay: false,
  colorKeys: ['color'],
  defaultOptions: {
    period: 12,
    color: '#ff6d00',
    lineWidth: 1.5,
    levelColor: 'rgba(120, 134, 150, 0.5)',
  },
  params: o => [o.period],
  plots: o => [{ key: KEY, color: o.color, lineWidth: o.lineWidth }],
  levels: o => [{ value: 0, color: o.levelColor, dashed: false }],
  create: o => new RocCalc(o.period),
}

export default definition

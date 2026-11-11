import { BaseCalc } from './helpers'
import type { BarReader, IndicatorDefinition } from './types'

/**
 * On-Balance Volume (PLAN §8.4) — a running total that adds the bar's volume
 * on up closes and subtracts it on down closes, so it accumulates buying vs
 * selling pressure. A pane indicator, autoscaled to its own (unbounded)
 * values. Its own subpath module: `import('@lightfin/core/indicators/obv')`.
 */
export interface ObvOptions {
  color: string
  lineWidth: number
}

const KEY = 'obv'

class ObvCalc extends BaseCalc {
  constructor() {
    super([KEY])
  }

  protected computeAt(reader: BarReader, index: number): void {
    // The series is anchored at zero on its first bar (no prior close to compare).
    if (index === reader.firstIndex) {
      this.set(KEY, index, 0)
      return
    }
    const prev = this.prior(KEY, index - 1)
    const change = reader.close(index) - reader.close(index - 1)
    const vol = reader.volume(index)
    // A bar without volume (NaN) contributes nothing; carry the total forward.
    let delta = 0
    if (Number.isFinite(vol)) {
      if (change > 0) delta = vol
      else if (change < 0) delta = -vol
    }
    this.set(KEY, index, prev + delta)
  }
}

const definition: IndicatorDefinition<ObvOptions> = {
  name: 'OBV',
  overlay: false,
  colorKeys: ['color'],
  defaultOptions: { color: '#2962ff', lineWidth: 1.5 },
  plots: o => [{ key: KEY, color: o.color, lineWidth: o.lineWidth }],
  create: () => new ObvCalc(),
}

export default definition

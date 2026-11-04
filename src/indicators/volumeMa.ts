import { BaseCalc } from './helpers'
import type { BarReader, IndicatorDefinition } from './types'

/**
 * Volume Moving Average (PLAN §8.4) — the mean of the last `period` volumes,
 * drawn as a line over the volume histogram on its hidden scale. Renders only
 * while the chart shows volume (`volumeVisible` with volume-carrying bars).
 * Its own subpath module: `import('lightfin-web-chart/indicators/volumeMa')`.
 */
export interface VolumeMaOptions {
  period: number
  color: string
  lineWidth: number
}

const KEY = 'volumeMa'

class VolumeMaCalc extends BaseCalc {
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
    // A bar without volume leaves the whole window undefined rather than
    // silently averaging it as zero.
    let sum = 0
    for (let j = index - this.period + 1; j <= index; j++)
      sum += reader.volume(j)
    this.set(KEY, index, sum / this.period)
  }
}

const definition: IndicatorDefinition<VolumeMaOptions> = {
  name: 'Volume MA',
  overlay: true,
  scale: 'volume',
  defaultOptions: { period: 20, color: '#f7a600', lineWidth: 1.5 },
  params: o => [o.period],
  plots: o => [{ key: KEY, color: o.color, lineWidth: o.lineWidth }],
  create: o => new VolumeMaCalc(o.period),
}

export default definition

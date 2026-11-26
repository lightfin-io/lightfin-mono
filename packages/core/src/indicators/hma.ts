import { BaseCalc } from './helpers'
import type { BarReader, IndicatorDefinition } from './types'

/**
 * Hull Moving Average. A fast smooth of close: the WMA of
 * `2 × WMA(floor(period / 2)) − WMA(period)`, itself smoothed over
 * `round(sqrt(period))` bars. One overlay line. Its own subpath module:
 * `import('@lightfin/core/indicators/hma')`.
 */
export interface HmaOptions {
  period: number
  color: string
  lineWidth: number
}

const HMA = 'hma'
const HALF = 'half'
const FULL = 'full'
const RAW = 'raw'

class HmaCalc extends BaseCalc {
  private readonly period: number
  private readonly half: number
  private readonly smooth: number
  private readonly halfWeight: number
  private readonly fullWeight: number
  private readonly smoothWeight: number

  constructor(period: number) {
    super([HMA, HALF, FULL, RAW])
    this.period = period
    this.half = Math.max(1, Math.floor(period / 2))
    this.smooth = Math.max(1, Math.round(Math.sqrt(period)))
    this.halfWeight = (this.half * (this.half + 1)) / 2
    this.fullWeight = (period * (period + 1)) / 2
    this.smoothWeight = (this.smooth * (this.smooth + 1)) / 2
  }

  /** Linear-weighted mean of close. The newest bar carries weight `period`. */
  private wmaClose(
    reader: BarReader,
    index: number,
    period: number,
    weightSum: number,
  ): number {
    if (index - reader.firstIndex < period - 1) return NaN
    let weighted = 0
    for (let j = 0; j < period; j++) {
      weighted += reader.close(index - period + 1 + j) * (j + 1)
    }
    return weighted / weightSum
  }

  /** Linear-weighted mean of an already-stored column, or NaN during warmup. */
  private wmaColumn(
    key: string,
    index: number,
    period: number,
    weightSum: number,
  ): number {
    const start = index - period + 1
    let weighted = 0
    for (let j = 0; j < period; j++) {
      const value = this.value(key, start + j)
      if (!Number.isFinite(value)) return NaN
      weighted += value * (j + 1)
    }
    return weighted / weightSum
  }

  protected computeAt(reader: BarReader, index: number): void {
    const half = this.wmaClose(reader, index, this.half, this.halfWeight)
    const full = this.wmaClose(reader, index, this.period, this.fullWeight)
    this.set(HALF, index, half)
    this.set(FULL, index, full)
    const raw =
      Number.isFinite(half) && Number.isFinite(full) ? 2 * half - full : NaN
    this.set(RAW, index, raw)
    this.set(
      HMA,
      index,
      this.wmaColumn(RAW, index, this.smooth, this.smoothWeight),
    )
  }
}

const definition: IndicatorDefinition<HmaOptions> = {
  name: 'HMA',
  overlay: true,
  colorKeys: ['color'],
  defaultOptions: { period: 9, color: '#ff6d00', lineWidth: 1.5 },
  params: o => [o.period],
  plots: o => [{ key: HMA, color: o.color, lineWidth: o.lineWidth }],
  create: o => new HmaCalc(o.period),
}

export default definition

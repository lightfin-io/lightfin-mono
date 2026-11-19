import { BaseCalc, trueRange } from './helpers'
import type { BarReader, IndicatorDefinition } from './types'

/**
 * Average Directional Index, Wilder's method. Measures trend
 * *strength* (ADX) regardless of direction, alongside the +DI / −DI
 * directional lines whose crossovers hint at direction. A pane indicator
 * (values 0–100, autoscaled) with a 25 "trend" reference line. Its own subpath
 * module: `import('@lightfin/core/indicators/adx')`.
 */
export interface AdxOptions {
  period: number
  adxColor: string
  plusColor: string
  minusColor: string
  lineWidth: number
  levelColor: string
}

const ADX = 'adx'
const PLUS_DI = 'plusDi'
const MINUS_DI = 'minusDi'
// Internal (non-plotted) Wilder running sums and the raw DX feeding the ADX.
const SM_TR = 'smTr'
const SM_PDM = 'smPdm'
const SM_MDM = 'smMdm'
const DX = 'dx'

class AdxCalc extends BaseCalc {
  private readonly period: number
  constructor(period: number) {
    super([ADX, PLUS_DI, MINUS_DI, SM_TR, SM_PDM, SM_MDM, DX])
    this.period = period
  }

  /** +DM for `index`: the up-move, but only when it dominates the down-move. */
  private plusDm(reader: BarReader, index: number): number {
    if (index === reader.firstIndex) return 0
    const up = reader.high(index) - reader.high(index - 1)
    const down = reader.low(index - 1) - reader.low(index)
    return up > down && up > 0 ? up : 0
  }

  /** −DM for `index`: the down-move, but only when it dominates the up-move. */
  private minusDm(reader: BarReader, index: number): number {
    if (index === reader.firstIndex) return 0
    const up = reader.high(index) - reader.high(index - 1)
    const down = reader.low(index - 1) - reader.low(index)
    return down > up && down > 0 ? down : 0
  }

  /**
   * One Wilder running-sum step for a smoothed column: seeded at the first full
   * window with the plain sum of the `period` raw values, then
   * `prev − prev/period + current` thereafter.
   */
  private smooth(
    reader: BarReader,
    index: number,
    key: string,
    raw: (i: number) => number,
  ): number {
    const p = this.period
    const offset = index - reader.firstIndex
    // Directional movement and TR start at the second bar (offset 1), so the
    // first full window of `period` values ends at offset == period.
    if (offset < p) return NaN
    if (offset === p) {
      let sum = 0
      for (let i = index - p + 1; i <= index; i++) sum += raw(i)
      return sum
    }
    const prev = this.prior(key, index - 1)
    return prev - prev / p + raw(index)
  }

  protected computeAt(reader: BarReader, index: number): void {
    const p = this.period
    const offset = index - reader.firstIndex

    const smTr = this.smooth(reader, index, SM_TR, i => trueRange(reader, i))
    const smPdm = this.smooth(reader, index, SM_PDM, i =>
      this.plusDm(reader, i),
    )
    const smMdm = this.smooth(reader, index, SM_MDM, i =>
      this.minusDm(reader, i),
    )
    this.set(SM_TR, index, smTr)
    this.set(SM_PDM, index, smPdm)
    this.set(SM_MDM, index, smMdm)

    if (offset < p || smTr === 0) {
      this.set(PLUS_DI, index, offset < p ? NaN : 0)
      this.set(MINUS_DI, index, offset < p ? NaN : 0)
      this.set(DX, index, offset < p ? NaN : 0)
      this.set(ADX, index, NaN)
      return
    }

    const plusDi = (100 * smPdm) / smTr
    const minusDi = (100 * smMdm) / smTr
    this.set(PLUS_DI, index, plusDi)
    this.set(MINUS_DI, index, minusDi)
    const diSum = plusDi + minusDi
    const dx = diSum === 0 ? 0 : (100 * Math.abs(plusDi - minusDi)) / diSum
    this.set(DX, index, dx)

    // ADX is the Wilder average of DX, which first has `period` values at
    // offset 2·period−1; seed there, then smooth recursively.
    const firstAdx = 2 * p - 1
    if (offset < firstAdx) {
      this.set(ADX, index, NaN)
    } else if (offset === firstAdx) {
      let sum = 0
      for (let i = index - p + 1; i <= index; i++) sum += this.value(DX, i)
      this.set(ADX, index, sum / p)
    } else {
      const prev = this.prior(ADX, index - 1)
      this.set(ADX, index, (prev * (p - 1) + dx) / p)
    }
  }
}

const definition: IndicatorDefinition<AdxOptions> = {
  name: 'ADX',
  overlay: false,
  colorKeys: ['adxColor', 'plusColor', 'minusColor'],
  defaultOptions: {
    period: 14,
    adxColor: '#2962ff',
    plusColor: '#26a69a',
    minusColor: '#ef5350',
    lineWidth: 1.5,
    levelColor: 'rgba(120, 134, 150, 0.6)',
  },
  params: o => [o.period],
  plots: o => [
    { key: PLUS_DI, color: o.plusColor, lineWidth: o.lineWidth },
    { key: MINUS_DI, color: o.minusColor, lineWidth: o.lineWidth },
    { key: ADX, color: o.adxColor, lineWidth: o.lineWidth },
  ],
  levels: o => [{ value: 25, color: o.levelColor }],
  create: o => new AdxCalc(o.period),
}

export default definition

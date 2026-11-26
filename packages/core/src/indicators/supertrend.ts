import { BaseCalc, averageTrueRange } from './helpers'
import type { BarReader, IndicatorDefinition } from './types'

/** Supertrend trails price with ATR bands and flips when the close crosses the active band. */
export interface SupertrendOptions {
  atrPeriod: number
  mult: number
  upColor: string
  downColor: string
  lineWidth: number
}

const UP = 'up'
const DOWN = 'down'
// Both bands are carried forward, even though only the active one is plotted.
const UPPER = 'upper'
const LOWER = 'lower'
const ATR = 'atr'

class SupertrendCalc extends BaseCalc {
  private readonly atrPeriod: number
  private readonly mult: number

  constructor(atrPeriod: number, mult: number) {
    super([UP, DOWN, UPPER, LOWER, ATR])
    this.atrPeriod = atrPeriod
    this.mult = mult
  }

  protected computeAt(reader: BarReader, index: number): void {
    const prev = index - 1
    const atr = averageTrueRange(
      reader,
      index,
      this.atrPeriod,
      this.prior(ATR, prev),
    )
    if (!Number.isFinite(atr)) return

    const midpoint = (reader.high(index) + reader.low(index)) / 2
    const offset = this.mult * atr
    let upper = midpoint + offset
    let lower = midpoint - offset
    let up = false

    const prevUpper = this.prior(UPPER, prev)
    if (Number.isFinite(prevUpper)) {
      const prevLower = this.prior(LOWER, prev)
      const prevClose = reader.close(prev)
      if (prevClose <= prevUpper) upper = Math.min(upper, prevUpper)
      if (prevClose >= prevLower) lower = Math.max(lower, prevLower)

      const close = reader.close(index)
      const wasUp = Number.isFinite(this.prior(UP, prev))
      up = wasUp ? close >= lower : close > upper
    }

    this.set(ATR, index, atr)
    this.set(UPPER, index, upper)
    this.set(LOWER, index, lower)
    this.set(UP, index, up ? lower : NaN)
    this.set(DOWN, index, up ? NaN : upper)
  }
}

const definition: IndicatorDefinition<SupertrendOptions> = {
  name: 'Supertrend',
  overlay: true,
  colorKeys: ['upColor', 'downColor'],
  defaultOptions: {
    atrPeriod: 10,
    mult: 3,
    upColor: '#26a69a',
    downColor: '#ef5350',
    lineWidth: 1.5,
  },
  params: o => [o.atrPeriod, o.mult],
  plots: o => [
    { key: UP, color: o.upColor, lineWidth: o.lineWidth },
    { key: DOWN, color: o.downColor, lineWidth: o.lineWidth },
  ],
  create: o => new SupertrendCalc(o.atrPeriod, o.mult),
}

export default definition

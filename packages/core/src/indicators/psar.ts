import { BaseCalc } from './helpers'
import type { BarReader, IndicatorDefinition } from './types'

/**
 * Parabolic SAR. Trails price and flips when a bar crosses it.
 * The first bar only seeds the state (long, SAR at that bar's low, extreme
 * point at its high) and is not plotted. Each later bar steps
 * `SAR + AF × (EP − SAR)` from the prior bar, then clamps an uptrend SAR to
 * the prior two lows and a downtrend SAR to the prior two highs. A new
 * extreme raises the extreme point and steps the acceleration factor, up to
 * `afMax`, for the *next* bar. A cross flips the trend: SAR jumps to the
 * extreme point and the factor resets to `afStart`. The two plots split the
 * line so a flip doesn't stroke through price. Its own subpath module:
 * `import('@lightfin/core/indicators/psar')`.
 */
export interface PsarOptions {
  afStart: number
  afStep: number
  afMax: number
  upColor: string
  downColor: string
  lineWidth: number
}

const UP = 'up'
const DOWN = 'down'
const SAR = 'sar'
const EP = 'ep'
const AF = 'af'
const TREND = 'trend'

class PsarCalc extends BaseCalc {
  private readonly afStart: number
  private readonly afStep: number
  private readonly afMax: number

  constructor(afStart: number, afStep: number, afMax: number) {
    super([UP, DOWN, SAR, EP, AF, TREND])
    this.afStart = afStart
    this.afStep = afStep
    this.afMax = afMax
  }

  protected computeAt(reader: BarReader, index: number): void {
    if (index === reader.firstIndex) {
      this.set(SAR, index, reader.low(index))
      this.set(EP, index, reader.high(index))
      this.set(AF, index, this.afStart)
      this.set(TREND, index, 1)
      this.set(UP, index, NaN)
      this.set(DOWN, index, NaN)
      return
    }

    const prev = index - 1
    const prevEp = this.prior(EP, prev)
    const prevSar = this.prior(SAR, prev)
    let sar = prevSar + this.prior(AF, prev) * (prevEp - prevSar)
    let ep = prevEp
    let af = this.prior(AF, prev)
    let up = this.prior(TREND, prev) === 1
    const high = reader.high(index)
    const low = reader.low(index)

    if (up) {
      sar = Math.min(sar, reader.low(prev))
      if (prev > reader.firstIndex) sar = Math.min(sar, reader.low(prev - 1))
      if (high > ep) {
        ep = high
        af = Math.min(af + this.afStep, this.afMax)
      }
      if (low < sar) {
        up = false
        sar = ep
        ep = low
        af = this.afStart
      }
    } else {
      sar = Math.max(sar, reader.high(prev))
      if (prev > reader.firstIndex) sar = Math.max(sar, reader.high(prev - 1))
      if (low < ep) {
        ep = low
        af = Math.min(af + this.afStep, this.afMax)
      }
      if (high > sar) {
        up = true
        sar = ep
        ep = high
        af = this.afStart
      }
    }

    this.set(SAR, index, sar)
    this.set(EP, index, ep)
    this.set(AF, index, af)
    this.set(TREND, index, up ? 1 : 0)
    this.set(UP, index, up ? sar : NaN)
    this.set(DOWN, index, up ? NaN : sar)
  }
}

const definition: IndicatorDefinition<PsarOptions> = {
  name: 'PSAR',
  overlay: true,
  colorKeys: ['upColor', 'downColor'],
  defaultOptions: {
    afStart: 0.02,
    afStep: 0.02,
    afMax: 0.2,
    upColor: '#26a69a',
    downColor: '#ef5350',
    lineWidth: 1.5,
  },
  params: o => [o.afStart, o.afStep, o.afMax],
  plots: o => [
    { key: UP, color: o.upColor, lineWidth: o.lineWidth },
    { key: DOWN, color: o.downColor, lineWidth: o.lineWidth },
  ],
  create: o => new PsarCalc(o.afStart, o.afStep, o.afMax),
}

export default definition

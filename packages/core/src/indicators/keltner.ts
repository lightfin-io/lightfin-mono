import { averageTrueRange, BaseCalc, meanClose } from './helpers'
import type { BarReader, IndicatorDefinition } from './types'

/**
 * Keltner Channels: an EMA(`period`) middle line with bands set
 * `mult` × ATR(`atrPeriod`) above and below it, plus a translucent fill. Like
 * Bollinger Bands but volatility-scaled by ATR rather than standard deviation.
 * Overlay on the main pane. Its own subpath module:
 * `import('@lightfin/core/indicators/keltner')`.
 */
export interface KeltnerOptions {
  period: number
  atrPeriod: number
  mult: number
  color: string
  /** Fill color for the channel region (should be translucent). */
  fillColor: string
  lineWidth: number
}

const MIDDLE = 'middle'
const UPPER = 'upper'
const LOWER = 'lower'
// Internal (non-plotted) EMA of close and ATR feeding the bands.
const EMA = 'ema'
const ATR = 'atr'

class KeltnerCalc extends BaseCalc {
  private readonly period: number
  private readonly atrPeriod: number
  private readonly mult: number
  private readonly k: number

  constructor(period: number, atrPeriod: number, mult: number) {
    super([MIDDLE, UPPER, LOWER, EMA, ATR])
    this.period = period
    this.atrPeriod = atrPeriod
    this.mult = mult
    this.k = 2 / (period + 1)
  }

  /** One EMA-of-close step, seeded by SMA at its first full window. */
  private emaStep(reader: BarReader, index: number): number {
    const offset = index - reader.firstIndex
    if (offset < this.period - 1) return NaN
    if (offset === this.period - 1) return meanClose(reader, index, this.period)
    return (
      reader.close(index) * this.k + this.prior(EMA, index - 1) * (1 - this.k)
    )
  }

  protected computeAt(reader: BarReader, index: number): void {
    const ema = this.emaStep(reader, index)
    const atr = averageTrueRange(
      reader,
      index,
      this.atrPeriod,
      this.prior(ATR, index - 1),
    )
    this.set(EMA, index, ema)
    this.set(ATR, index, atr)
    this.set(MIDDLE, index, ema)
    if (Number.isFinite(ema) && Number.isFinite(atr)) {
      this.set(UPPER, index, ema + this.mult * atr)
      this.set(LOWER, index, ema - this.mult * atr)
    } else {
      this.set(UPPER, index, NaN)
      this.set(LOWER, index, NaN)
    }
  }
}

const definition: IndicatorDefinition<KeltnerOptions> = {
  name: 'Keltner',
  overlay: true,
  colorKeys: ['color'],
  defaultOptions: {
    period: 20,
    atrPeriod: 10,
    mult: 2,
    color: '#ef5350',
    fillColor: 'rgba(239, 83, 80, 0.08)',
    lineWidth: 1,
  },
  params: o => [o.period, o.mult],
  plots: o => [
    { key: UPPER, color: o.color, lineWidth: o.lineWidth },
    { key: MIDDLE, color: o.color, lineWidth: o.lineWidth },
    { key: LOWER, color: o.color, lineWidth: o.lineWidth },
  ],
  fills: o => [{ upper: UPPER, lower: LOWER, color: o.fillColor }],
  create: o => new KeltnerCalc(o.period, o.atrPeriod, o.mult),
}

export default definition

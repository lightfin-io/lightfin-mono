import { BaseCalc, meanClose, stdDevClose } from './helpers'
import type { BarReader, IndicatorDefinition } from './types'

/**
 * Bollinger Bands (PLAN §8.4): an SMA(`period`) middle line with upper/lower
 * bands at ±`mult` population standard deviations, plus a translucent fill
 * between them. Overlay on the main pane. Its own subpath module:
 * `import('lightfin-web-chart/indicators/bollinger')`.
 */
export interface BollingerOptions {
  period: number
  mult: number
  color: string
  /** Fill color for the band region (should be translucent). */
  fillColor: string
  lineWidth: number
}

const MIDDLE = 'middle'
const UPPER = 'upper'
const LOWER = 'lower'

class BollingerCalc extends BaseCalc {
  private readonly period: number
  private readonly mult: number
  constructor(period: number, mult: number) {
    super([MIDDLE, UPPER, LOWER])
    this.period = period
    this.mult = mult
  }

  protected computeAt(reader: BarReader, index: number): void {
    if (index - reader.firstIndex < this.period - 1) {
      this.set(MIDDLE, index, NaN)
      this.set(UPPER, index, NaN)
      this.set(LOWER, index, NaN)
      return
    }
    const mean = meanClose(reader, index, this.period)
    const band = this.mult * stdDevClose(reader, index, this.period, mean)
    this.set(MIDDLE, index, mean)
    this.set(UPPER, index, mean + band)
    this.set(LOWER, index, mean - band)
  }
}

const definition: IndicatorDefinition<BollingerOptions> = {
  name: 'BB',
  overlay: true,
  defaultOptions: {
    period: 20,
    mult: 2,
    color: '#26a69a',
    fillColor: 'rgba(38, 166, 154, 0.08)',
    lineWidth: 1,
  },
  params: o => [o.period, o.mult],
  plots: o => [
    { key: UPPER, color: o.color, lineWidth: o.lineWidth },
    { key: MIDDLE, color: o.color, lineWidth: o.lineWidth },
    { key: LOWER, color: o.color, lineWidth: o.lineWidth },
  ],
  fills: o => [{ upper: UPPER, lower: LOWER, color: o.fillColor }],
  create: o => new BollingerCalc(o.period, o.mult),
}

export default definition

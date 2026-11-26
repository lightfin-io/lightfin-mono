import { BaseCalc, highestHigh, lowestLow } from './helpers'
import type { BarReader, IndicatorDefinition } from './types'

/**
 * Ichimoku Cloud. Tenkan and kijun are midpoints of the high/low range
 * over their windows. Span A (the midpoint of tenkan and kijun) and span B
 * (the midpoint over the senkou window) are stored `displacement` bars ahead
 * of the bar that produced them, so the cloud leads price — including into
 * the blank slots after the last candle, as far as the right margin shows.
 * Chikou is the close stored that many bars back. The cloud is green while
 * span A is above span B and red otherwise; a twist belongs to both fills so
 * the two regions meet. Its own subpath module:
 * `import('@lightfin/core/indicators/ichimoku')`.
 */
export interface IchimokuOptions {
  tenkan: number
  kijun: number
  senkou: number
  displacement: number
  tenkanColor: string
  kijunColor: string
  spanAColor: string
  spanBColor: string
  chikouColor: string
  /** Fill while span A is above span B (should be translucent). */
  bullFill: string
  /** Fill while span A is below span B (should be translucent). */
  bearFill: string
  lineWidth: number
}

const TENKAN = 'tenkan'
const KIJUN = 'kijun'
const SPAN_A = 'spanA'
const SPAN_B = 'spanB'
const CHIKOU = 'chikou'
// Fill edges only — not plotted. Both are set on a twist so the regions meet.
const BULL_HI = 'bullHigh'
const BULL_LO = 'bullLow'
const BEAR_HI = 'bearHigh'
const BEAR_LO = 'bearLow'

class IchimokuCalc extends BaseCalc {
  private readonly tenkan: number
  private readonly kijun: number
  private readonly senkou: number
  private readonly displacement: number

  constructor(
    tenkan: number,
    kijun: number,
    senkou: number,
    displacement: number,
  ) {
    super([
      TENKAN,
      KIJUN,
      SPAN_A,
      SPAN_B,
      CHIKOU,
      BULL_HI,
      BULL_LO,
      BEAR_HI,
      BEAR_LO,
    ])
    this.tenkan = tenkan
    this.kijun = kijun
    this.senkou = senkou
    this.displacement = displacement
  }

  /** Midpoint of the high/low range over `period` bars ending at `index`. */
  private mid(reader: BarReader, index: number, period: number): number {
    if (period < 1 || index - reader.firstIndex + 1 < period) return NaN
    return (
      (highestHigh(reader, index, period) + lowestLow(reader, index, period)) /
      2
    )
  }

  protected computeAt(reader: BarReader, index: number): void {
    const tenkan = this.mid(reader, index, this.tenkan)
    const kijun = this.mid(reader, index, this.kijun)
    const spanB = this.mid(reader, index, this.senkou)
    this.set(TENKAN, index, tenkan)
    this.set(KIJUN, index, kijun)

    const spanA =
      Number.isFinite(tenkan) && Number.isFinite(kijun)
        ? (tenkan + kijun) / 2
        : NaN
    const lead = index + this.displacement
    this.set(SPAN_A, lead, spanA)
    this.set(SPAN_B, lead, spanB)
    const both = Number.isFinite(spanA) && Number.isFinite(spanB)
    const top = both ? Math.max(spanA, spanB) : NaN
    const bottom = both ? Math.min(spanA, spanB) : NaN
    const bull = both && spanA >= spanB
    const bear = both && spanA <= spanB
    this.set(BULL_HI, lead, bull ? top : NaN)
    this.set(BULL_LO, lead, bull ? bottom : NaN)
    this.set(BEAR_HI, lead, bear ? top : NaN)
    this.set(BEAR_LO, lead, bear ? bottom : NaN)

    // Clear this bar first. A later bar writes the close that belongs here,
    // and a live tick rewrites the close `displacement` bars back.
    this.set(CHIKOU, index, NaN)
    const back = index - this.displacement
    if (back >= reader.firstIndex) this.set(CHIKOU, back, reader.close(index))
  }
}

const definition: IndicatorDefinition<IchimokuOptions> = {
  name: 'Ichimoku',
  overlay: true,
  colorKeys: [
    'tenkanColor',
    'kijunColor',
    'spanAColor',
    'spanBColor',
    'chikouColor',
  ],
  defaultOptions: {
    tenkan: 9,
    kijun: 26,
    senkou: 52,
    displacement: 26,
    tenkanColor: '#2962ff',
    kijunColor: '#ef5350',
    spanAColor: '#26a69a',
    spanBColor: '#ef5350',
    chikouColor: '#7e57c2',
    bullFill: 'rgba(38, 166, 154, 0.12)',
    bearFill: 'rgba(239, 83, 80, 0.12)',
    lineWidth: 1.5,
  },
  params: o => [o.tenkan, o.kijun, o.senkou, o.displacement],
  plots: o => [
    { key: TENKAN, color: o.tenkanColor, lineWidth: o.lineWidth },
    { key: KIJUN, color: o.kijunColor, lineWidth: o.lineWidth },
    { key: CHIKOU, color: o.chikouColor, lineWidth: o.lineWidth },
    { key: SPAN_A, color: o.spanAColor, lineWidth: o.lineWidth },
    { key: SPAN_B, color: o.spanBColor, lineWidth: o.lineWidth },
  ],
  fills: o => [
    { upper: BULL_HI, lower: BULL_LO, color: o.bullFill },
    { upper: BEAR_HI, lower: BEAR_LO, color: o.bearFill },
  ],
  create: o => new IchimokuCalc(o.tenkan, o.kijun, o.senkou, o.displacement),
}

export default definition

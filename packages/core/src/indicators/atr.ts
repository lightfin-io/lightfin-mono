import { averageTrueRange, BaseCalc } from './helpers'
import type { BarReader, IndicatorDefinition } from './types'

/**
 * Average True Range, Wilder's smoothing — a volatility measure in
 * price units. True Range is the greatest of the current bar's range and its
 * gaps from the prior close; ATR is the Wilder-smoothed mean of that over
 * `period` bars. A pane indicator, autoscaled to its own values (no fixed
 * range). Its own subpath module: `import('@lightfin/core/indicators/atr')`.
 */
export interface AtrOptions {
  period: number
  color: string
  lineWidth: number
}

const ATR = 'atr'

class AtrCalc extends BaseCalc {
  private readonly period: number
  constructor(period: number) {
    super([ATR])
    this.period = period
  }

  protected computeAt(reader: BarReader, index: number): void {
    const atr = averageTrueRange(
      reader,
      index,
      this.period,
      this.prior(ATR, index - 1),
    )
    this.set(ATR, index, atr)
  }
}

const definition: IndicatorDefinition<AtrOptions> = {
  name: 'ATR',
  overlay: false,
  colorKeys: ['color'],
  defaultOptions: { period: 14, color: '#f23645', lineWidth: 1.5 },
  params: o => [o.period],
  plots: o => [{ key: ATR, color: o.color, lineWidth: o.lineWidth }],
  create: o => new AtrCalc(o.period),
}

export default definition

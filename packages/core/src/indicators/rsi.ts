import { RSI, RsiCalc } from './rsiCalc'
import type { IndicatorDefinition } from './types'

/**
 * Relative Strength Index, Wilder's smoothing. A pane indicator on
 * a fixed 0–100 scale with overbought/oversold reference lines. Its own subpath
 * module: `import('@lightfin/core/indicators/rsi')`.
 */
export interface RsiOptions {
  period: number
  color: string
  lineWidth: number
  overbought: number
  oversold: number
  levelColor: string
}

const definition: IndicatorDefinition<RsiOptions> = {
  name: 'RSI',
  overlay: false,
  colorKeys: ['color'],
  defaultOptions: {
    period: 14,
    color: '#7e57c2',
    lineWidth: 1.5,
    overbought: 70,
    oversold: 30,
    levelColor: 'rgba(120, 134, 150, 0.6)',
  },
  params: o => [o.period],
  plots: o => [{ key: RSI, color: o.color, lineWidth: o.lineWidth }],
  fixedRange: () => ({ min: 0, max: 100 }),
  levels: o => [
    { value: o.overbought, color: o.levelColor },
    { value: o.oversold, color: o.levelColor },
  ],
  create: o => new RsiCalc(o.period),
}

export default definition

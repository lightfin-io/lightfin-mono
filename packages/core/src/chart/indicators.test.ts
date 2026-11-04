import { describe, expect, it } from 'vitest'

import type { IndicatorDefinition } from '../indicators/types'
import { IndicatorInstance } from './indicators'
import { DEFAULT_THEME } from './options'

interface TwoColorOptions {
  period: number
  macdColor: string
  signalColor: string
}

const twoColorDef: IndicatorDefinition<TwoColorOptions> = {
  name: 'Test',
  overlay: true,
  colorKeys: ['macdColor', 'signalColor'],
  defaultOptions: { period: 10, macdColor: '#000000', signalColor: '#111111' },
  plots: o => [
    { key: 'a', color: o.macdColor },
    { key: 'b', color: o.signalColor },
  ],
  create: () => ({
    value: () => NaN,
    calculateAll: () => {},
    updateLast: () => {},
  }),
}

describe('IndicatorInstance palette resolution', () => {
  it('fills colorKeys from the theme palette, cycling by colorSlot', () => {
    const palette = DEFAULT_THEME.indicatorPalette
    const first = new IndicatorInstance(twoColorDef, {}, DEFAULT_THEME, 0)
    expect(first.options.macdColor).toBe(palette[0])
    expect(first.options.signalColor).toBe(palette[1])

    const second = new IndicatorInstance(twoColorDef, {}, DEFAULT_THEME, 1)
    expect(second.options.macdColor).toBe(palette[1])
    expect(second.options.signalColor).toBe(palette[2])
  })

  it('wraps around once the slot exceeds the palette length', () => {
    const palette = DEFAULT_THEME.indicatorPalette
    const inst = new IndicatorInstance(
      twoColorDef,
      {},
      DEFAULT_THEME,
      palette.length - 1,
    )
    expect(inst.options.macdColor).toBe(palette[palette.length - 1])
    expect(inst.options.signalColor).toBe(palette[0])
  })

  it('never overrides a color the caller passed explicitly', () => {
    const inst = new IndicatorInstance(
      twoColorDef,
      { macdColor: '#ff00ff' },
      DEFAULT_THEME,
      0,
    )
    expect(inst.options.macdColor).toBe('#ff00ff')
    expect(inst.options.signalColor).toBe(DEFAULT_THEME.indicatorPalette[1])
  })

  it('leaves colorKeys-less indicators on their hardcoded default', () => {
    const noColorKeys: IndicatorDefinition<{ color: string }> = {
      name: 'Plain',
      overlay: true,
      defaultOptions: { color: '#abcdef' },
      plots: o => [{ key: 'a', color: o.color }],
      create: () => ({
        value: () => NaN,
        calculateAll: () => {},
        updateLast: () => {},
      }),
    }
    const inst = new IndicatorInstance(noColorKeys, {}, DEFAULT_THEME, 0)
    expect(inst.options.color).toBe('#abcdef')
  })
})

import { describe, expect, it } from 'vitest'

import { StoreReader } from '../data/barReader'
import { ColumnStore } from '../data/store'
import type { IndicatorDefinition } from '../indicators/types'
import {
  IndicatorController,
  IndicatorInstance,
  indicatorSlotWindow,
} from './indicators'
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

describe('indicatorSlotWindow', () => {
  it('extends past the last bar so a leading plot can use the right margin', () => {
    expect(indicatorSlotWindow({ from: 2.2, to: 10.1 }, 0, 8)).toEqual({
      from: 2,
      to: 11,
    })
  })

  it('clamps the left edge to the first bar and drops a view that ends before it', () => {
    expect(indicatorSlotWindow({ from: -4.8, to: 3.2 }, 0, 20)).toEqual({
      from: 0,
      to: 4,
    })
    expect(indicatorSlotWindow({ from: -8, to: -1.2 }, 0, 20)).toEqual({
      from: 0,
      to: -1,
    })
    expect(indicatorSlotWindow({ from: 0, to: 4 }, 0, -1)).toEqual({
      from: 0,
      to: -1,
    })
  })

  it('keeps slots that are entirely after the last candle', () => {
    expect(indicatorSlotWindow({ from: 12.4, to: 20.2 }, 0, 10)).toEqual({
      from: 12,
      to: 21,
    })
  })
})

it('overlay autoscale reads values stored past the last candle', () => {
  const lead: IndicatorDefinition<Record<string, never>> = {
    name: 'Lead',
    overlay: true,
    defaultOptions: {},
    plots: () => [{ key: 'lead', color: '#000' }],
    create: () => ({
      value: (_key, index) => (index === 12 ? 50 : NaN),
      calculateAll: () => {},
      updateLast: () => {},
    }),
  }
  const store = new ColumnStore()
  store.setData([{ time: 1, open: 1, high: 2, low: 1, close: 1 }])
  const ctl = new IndicatorController()
  ctl.add(
    new IndicatorInstance(lead, {}, DEFAULT_THEME, 0),
    new StoreReader(store),
  )
  expect(ctl.extendOverlayRange({ from: 0, to: 12 }, 1, 2)).toEqual({
    low: 1,
    high: 50,
  })
})

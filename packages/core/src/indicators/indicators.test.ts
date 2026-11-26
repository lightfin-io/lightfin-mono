import { describe, expect, it } from 'vitest'

import { StoreReader } from '../data/barReader'
import { ColumnStore } from '../data/store'
import type { Bar } from '../data/types'
import adxDef from './adx'
import aroonDef from './aroon'
import atrDef from './atr'
import bollingerDef from './bollinger'
import cciDef from './cci'
import choppinessDef from './choppiness'
import cmfDef from './cmf'
import donchianDef from './donchian'
import emaDef from './ema'
import hmaDef from './hma'
import ichimokuDef from './ichimoku'
import keltnerDef from './keltner'
import macdDef from './macd'
import mfiDef from './mfi'
import obvDef from './obv'
import psarDef from './psar'
import rocDef from './roc'
import rsiDef from './rsi'
import smaDef from './sma'
import stochasticDef from './stochastic'
import stochasticRsiDef from './stochasticRsi'
import supertrendDef from './supertrend'
import type { IndicatorDefinition } from './types'
import volumeMaDef from './volumeMa'
import vwapDef from './vwap'
import vwmaDef from './vwma'
import williamsRDef from './williamsR'
import wmaDef from './wma'

// The core treats indicator options opaquely; tests do the same (see chart.ts).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDef = IndicatorDefinition<any>

/** Deterministic OHLC walk for test data. */
function bars(n: number): Bar[] {
  const out: Bar[] = []
  let price = 100
  for (let i = 0; i < n; i++) {
    const open = price
    const close = open + Math.sin(i / 3) * 2 + ((i * 7) % 5) - 2
    out.push({
      time: 1000 + i * 60,
      open,
      high: Math.max(open, close) + 1,
      low: Math.min(open, close) - 1,
      close,
      volume: 1000 + ((i * 37) % 11) * 100,
    })
    price = close
  }
  return out
}

/** Read every plot of a calc over the store's current index range into arrays. */
function snapshot(
  def: AnyDef,
  options: Record<string, unknown>,
  store: ColumnStore,
) {
  const calc = def.create({ ...def.defaultOptions, ...options })
  const reader = new StoreReader(store)
  calc.calculateAll(reader)
  const keys = def.plots({ ...def.defaultOptions, ...options }).map(p => p.key)
  const out: Record<string, number[]> = {}
  for (const key of keys) {
    out[key] = []
    for (let i = store.firstIndex; i <= store.lastIndex; i++) {
      out[key]!.push(calc.value(key, i))
    }
  }
  return out
}

const newDefinitions: [string, AnyDef, Record<string, unknown>][] = [
  ['Donchian', donchianDef, {}],
  ['Supertrend', supertrendDef, { mult: 1.5 }],
  ['Stochastic RSI', stochasticRsiDef, {}],
  ['VWMA', vwmaDef, {}],
  ['Money Flow Index', mfiDef, {}],
  ['Choppiness Index', choppinessDef, {}],
  ['Hull Moving Average', hmaDef, {}],
  ['Parabolic SAR', psarDef, {}],
  ['Chaikin Money Flow', cmfDef, {}],
  ['Aroon', aroonDef, {}],
]

const definitions: [string, AnyDef, Record<string, unknown>][] = [
  ['SMA', smaDef as unknown as AnyDef, { period: 10 }],
  ['EMA', emaDef as unknown as AnyDef, { period: 10 }],
  ['WMA', wmaDef as unknown as AnyDef, { period: 10 }],
  ['Bollinger', bollingerDef as unknown as AnyDef, { period: 10, mult: 2 }],
  ['Keltner', keltnerDef as unknown as AnyDef, { period: 10, atrPeriod: 10 }],
  ['RSI', rsiDef as unknown as AnyDef, { period: 14 }],
  ['MACD', macdDef as unknown as AnyDef, {}],
  [
    'Stochastic',
    stochasticDef as unknown as AnyDef,
    { kPeriod: 14, kSmooth: 3, dPeriod: 3 },
  ],
  ['Williams %R', williamsRDef as unknown as AnyDef, { period: 14 }],
  ['CCI', cciDef as unknown as AnyDef, { period: 20 }],
  ['ROC', rocDef as unknown as AnyDef, { period: 12 }],
  ['ADX', adxDef as unknown as AnyDef, { period: 14 }],
  ['ATR', atrDef as unknown as AnyDef, { period: 14 }],
  ['Volume MA', volumeMaDef as unknown as AnyDef, { period: 10 }],
  ...newDefinitions,
]

describe.each(definitions)('%s indicator', (_name, def, options) => {
  const resolved = { ...def.defaultOptions, ...options }
  const keys = def.plots(resolved).map(p => p.key)

  it('warms up and produces at least one finite plot on the last bar', () => {
    const store = new ColumnStore()
    store.setData(bars(80))
    const snap = snapshot(def, options, store)
    for (const key of keys) {
      expect(snap[key]![0]).toBeNaN()
      expect(snap[key]!.some(Number.isFinite)).toBe(true)
    }
    expect(keys.some(key => Number.isFinite(snap[key]!.at(-1)))).toBe(true)
  })

  it('incremental update() matches a from-scratch recompute', () => {
    const data = bars(80)

    // Batch: all bars at once.
    const batchStore = new ColumnStore()
    batchStore.setData(data)
    const batch = snapshot(def, options, batchStore)

    // Incremental: push one bar at a time, updating the tail each step.
    const liveStore = new ColumnStore()
    const calc = def.create(resolved)
    const reader = new StoreReader(liveStore)
    for (const bar of data) {
      liveStore.push(bar)
      calc.updateLast(reader)
    }

    for (const key of keys) {
      for (let i = liveStore.firstIndex; i <= liveStore.lastIndex; i++) {
        const live = calc.value(key, i)
        const want = batch[key]![i - liveStore.firstIndex]!
        if (Number.isNaN(want)) expect(live).toBeNaN()
        else expect(live).toBeCloseTo(want, 10)
      }
    }
  })

  it('an in-place tick recomputes the last value to match a full recompute', () => {
    const data = bars(40)
    const liveStore = new ColumnStore()
    const calc = def.create(resolved)
    const reader = new StoreReader(liveStore)
    for (const bar of data) {
      liveStore.push(bar)
      calc.updateLast(reader)
    }

    // Mutate the last (forming) bar in place, then update the tail.
    const last = data[data.length - 1]!
    const ticked: Bar = {
      ...last,
      close: last.close + 5,
      high: last.high + 5,
      volume: last.volume! * 1.5,
    }
    liveStore.push(ticked)
    calc.updateLast(reader)

    // Compare against a fresh recompute over the mutated dataset.
    const refStore = new ColumnStore()
    refStore.setData([...data.slice(0, -1), ticked])
    const ref = snapshot(def, options, refStore)
    for (const key of keys) {
      const live = calc.value(key, liveStore.lastIndex)
      const want = ref[key]![refStore.lastIndex - refStore.firstIndex]!
      expect(live).toBe(want)
    }
  })
})

it.each(newDefinitions)(
  '%s recalculates and continues live after backfill',
  (_name, def, options) => {
    const data = bars(81)
    const store = new ColumnStore()
    const reader = new StoreReader(store)
    const resolved = { ...def.defaultOptions, ...options }
    const calc = def.create(resolved)
    store.setData(data.slice(40, 80))
    calc.calculateAll(reader)
    store.prepend(data.slice(0, 40))
    expect(reader.firstIndex).toBe(-40)
    calc.calculateAll(reader)
    store.push(data[80]!)
    calc.updateLast(reader)

    const batchStore = new ColumnStore()
    batchStore.setData(data)
    const batch = snapshot(def, options, batchStore)
    for (const { key } of def.plots(resolved)) {
      expect(
        data.map((_, offset) => calc.value(key, reader.firstIndex + offset)),
      ).toEqual(batch[key])
    }
  },
)

it('Donchian Channels include the current bar and drop expired highs and lows', () => {
  const store = new ColumnStore()
  store.setData([
    { time: 1, open: 10, high: 15, low: 4, close: 10 },
    { time: 2, open: 10, high: 12, low: 7, close: 10 },
    { time: 3, open: 10, high: 13, low: 8, close: 10 },
    { time: 4, open: 10, high: 14, low: 6, close: 10 },
  ])
  expect(snapshot(donchianDef, { period: 2 }, store)).toEqual({
    upper: [NaN, 15, 13, 14],
    middle: [NaN, 9.5, 10, 10],
    lower: [NaN, 4, 7, 6],
  })
})

function closeBars(prices: number[]): Bar[] {
  return prices.map((close, time) => ({
    time,
    open: close,
    high: close,
    low: close,
    close,
  }))
}

it('VWMA weights closing prices over a rolling window across sessions', () => {
  const store = new ColumnStore()
  store.setData(
    closeBars([10, 20, 90, 30]).map((bar, i) => ({
      ...bar,
      time: 86_398 + i,
      high: bar.high + 6,
      volume: [1, 3, 0, 2][i],
    })),
  )
  expect(snapshot(vwmaDef, { period: 2 }, store).vwma).toEqual([
    NaN,
    17.5,
    20,
    30,
  ])
})

it('MFI classifies flows by typical price and ignores unchanged prices', () => {
  const store = new ColumnStore()
  const data = closeBars([10, 10, 9, 9, 11, 11, 11])
  data[1] = { ...data[1]!, high: 16 }
  store.setData(
    data.map((bar, i) => ({
      ...bar,
      volume: [undefined, 3, 4, 7, 1, 3, 2][i],
    })),
  )
  expect(snapshot(mfiDef, { period: 2 }, store).mfi).toEqual([
    NaN,
    NaN,
    50,
    0,
    100,
    100,
    50,
  ])
})

it('volume-weighted indicators leave gaps for missing or zero-total volume and recover', () => {
  const store = new ColumnStore()
  store.setData(
    closeBars([10, 11, 12, 13, 14, 15]).map((bar, i) => ({
      ...bar,
      volume: [0, 0, 0, undefined, 10, 10][i],
    })),
  )
  expect(snapshot(vwmaDef, { period: 2 }, store).vwma).toEqual([
    NaN,
    NaN,
    NaN,
    NaN,
    NaN,
    14.5,
  ])
  expect(snapshot(mfiDef, { period: 2 }, store).mfi).toEqual([
    NaN,
    NaN,
    NaN,
    NaN,
    NaN,
    100,
  ])
})

it('Choppiness distinguishes trends, reversals, and flat windows with gaps', () => {
  const store = new ColumnStore()
  store.setData(closeBars([10, 12, 13, 12, 13, 13, 13, 15, 14]))
  expect(snapshot(choppinessDef, { period: 2 }, store).chop).toEqual([
    NaN,
    0,
    0,
    100,
    100,
    0,
    100,
    0,
    expect.closeTo(58.49625, 5),
  ])
})

it('Supertrend trails the active band and flips only on a strict crossing', () => {
  const store = new ColumnStore()
  store.setData(closeBars([10, 10, 14, 16, 14, 9, 8]))
  expect(snapshot(supertrendDef, { atrPeriod: 2, mult: 1 }, store)).toEqual({
    up: [NaN, NaN, 12, 14, 14, NaN, NaN],
    down: [NaN, 10, NaN, NaN, NaN, 12.5, 10.25],
  })
})

describe('Stochastic RSI', () => {
  const options = { rsiPeriod: 2, stochPeriod: 2, kSmooth: 2, dPeriod: 2 }

  it('smooths normalized RSI to get %K, then smooths %K to get %D', () => {
    const store = new ColumnStore()
    store.setData(closeBars([10, 12, 11, 14, 13, 12, 14]))
    expect(snapshot(stochasticRsiDef, options, store)).toEqual({
      k: [NaN, NaN, NaN, NaN, 50, 0, 50],
      d: [NaN, NaN, NaN, NaN, NaN, 25, 25],
    })
  })

  it('uses the midpoint when the RSI range is flat', () => {
    const store = new ColumnStore()
    store.setData(closeBars([10, 11, 12, 13, 14, 15]))
    expect(snapshot(stochasticRsiDef, options, store)).toEqual({
      k: [NaN, NaN, NaN, NaN, 50, 50],
      d: [NaN, NaN, NaN, NaN, NaN, 50],
    })
  })
})

// OBV and VWAP are seeded on their very first bar (no warmup), so they sit
// outside the shared "first bar is NaN" harness and get their own coverage.
describe.each([
  ['OBV', obvDef as unknown as AnyDef, {}],
  ['VWAP', vwapDef as unknown as AnyDef, {}],
])('%s indicator (no warmup)', (_name, def, options) => {
  const resolved = { ...def.defaultOptions, ...options }
  const keys = def.plots(resolved).map(p => p.key)

  it('incremental update() matches a from-scratch recompute', () => {
    const data = bars(80)
    const batchStore = new ColumnStore()
    batchStore.setData(data)
    const batch = snapshot(def, options, batchStore)

    const liveStore = new ColumnStore()
    const calc = def.create(resolved)
    const reader = new StoreReader(liveStore)
    for (const bar of data) {
      liveStore.push(bar)
      calc.updateLast(reader)
    }

    for (const key of keys) {
      for (let i = liveStore.firstIndex; i <= liveStore.lastIndex; i++) {
        const live = calc.value(key, i)
        const want = batch[key]![i - liveStore.firstIndex]!
        if (Number.isNaN(want)) expect(live).toBeNaN()
        else expect(live).toBeCloseTo(want, 10)
      }
    }
  })
})

describe('OBV', () => {
  const bar = (time: number, close: number, volume?: number): Bar => ({
    time,
    open: close,
    high: close,
    low: close,
    close,
    volume,
  })

  it('accumulates volume up on up closes and down on down closes', () => {
    const store = new ColumnStore()
    store.setData([
      bar(1, 10, 100),
      bar(2, 11, 200), // up   → +200
      bar(3, 11, 300), // flat →  0
      bar(4, 9, 400), // down → −400
    ])
    const snap = snapshot(obvDef as unknown as AnyDef, {}, store)
    expect(snap.obv).toEqual([0, 200, 200, -200])
  })
})

describe('VWAP', () => {
  const bar = (time: number, price: number, volume: number): Bar => ({
    time,
    open: price,
    high: price,
    low: price,
    close: price,
    volume,
  })

  it('is the volume-weighted average price within a session', () => {
    const store = new ColumnStore()
    // Same UTC day → one running session.
    store.setData([bar(0, 10, 100), bar(60, 20, 300)])
    const snap = snapshot(vwapDef as unknown as AnyDef, {}, store)
    // (10·100 + 20·300) / (100 + 300) = 7000 / 400 = 17.5
    expect(snap.vwap).toEqual([10, 17.5])
  })

  it('re-anchors at the start of each UTC day', () => {
    const DAY = 86_400
    const store = new ColumnStore()
    store.setData([
      bar(0, 10, 100),
      bar(60, 20, 300), // still day 0 → weighted
      bar(DAY, 50, 100), // new day → resets to this bar's price
    ])
    const snap = snapshot(vwapDef as unknown as AnyDef, {}, store)
    expect(snap.vwap).toEqual([10, 17.5, 50])
  })
})

describe('Volume MA', () => {
  const vol = (time: number, volume?: number): Bar => ({
    time,
    open: 1,
    high: 1,
    low: 1,
    close: 1,
    volume,
  })

  it('averages the last `period` volumes', () => {
    const store = new ColumnStore()
    store.setData([vol(1, 100), vol(2, 200), vol(3, 600), vol(4, 400)])
    const snap = snapshot(
      volumeMaDef as unknown as AnyDef,
      { period: 3 },
      store,
    )
    expect(snap.volumeMa).toEqual([NaN, NaN, 300, 400])
  })

  it('is undefined for any window containing a bar without volume', () => {
    const store = new ColumnStore()
    store.setData([vol(1, 100), vol(2), vol(3, 300), vol(4, 300)])
    const snap = snapshot(
      volumeMaDef as unknown as AnyDef,
      { period: 2 },
      store,
    )
    expect(snap.volumeMa).toEqual([NaN, NaN, NaN, 300])
  })

  it('draws on the volume scale, not the price scale', () => {
    expect(volumeMaDef.overlay).toBe(true)
    expect(volumeMaDef.scale).toBe('volume')
  })
})

it('Hull MA is the smoothed difference of a half-length and full WMA', () => {
  const store = new ColumnStore()
  store.setData(closeBars([1, 2, 3, 4, 5, 6]))
  expect(snapshot(hmaDef, { period: 4 }, store).hma).toEqual([
    NaN,
    NaN,
    NaN,
    NaN,
    5,
    6,
  ])
})

it('Parabolic SAR trails, clamps to the prior two bars, and flips to the extreme', () => {
  const store = new ColumnStore()
  store.setData(
    ohlc([
      [10, 8],
      [11, 9],
      [12, 10],
      [13, 10],
      [12, 9],
      [11, 8],
      [10, 7],
    ]),
  )
  const snap = snapshot(
    psarDef,
    { afStart: 0.02, afStep: 0.02, afMax: 0.2 },
    store,
  )
  // The first steps sit above the prior low, so the clamp holds SAR there
  // until the two prior lows have both risen.
  expect(snap.up).toEqual([
    NaN,
    8,
    8,
    expect.closeTo(8.24, 5),
    expect.closeTo(8.6208, 5),
    NaN,
    NaN,
  ])
  expect(snap.down).toEqual([NaN, NaN, NaN, NaN, NaN, 13, 12.9])
})

it('Chaikin Money Flow weights closes inside the bar and gaps on bad volume', () => {
  const store = new ColumnStore()
  store.setData(
    ohlc([
      [10, 8, 9, 100],
      [12, 10, 12, 100],
      [10, 8, 8, 100],
      [10, 10, 10, 50],
    ]),
  )
  expect(snapshot(cmfDef, { period: 2 }, store).cmf).toEqual([
    NaN,
    0.5,
    0,
    expect.closeTo(-2 / 3, 8),
  ])

  const gappy = new ColumnStore()
  gappy.setData(
    ohlc([
      [10, 8, 9, 0],
      [12, 10, 12, 0],
      [10, 8, 8],
      [12, 10, 12, 10],
      [10, 8, 8, 10],
    ]),
  )
  expect(snapshot(cmfDef, { period: 2 }, gappy).cmf).toEqual([
    NaN,
    NaN,
    NaN,
    NaN,
    0,
  ])
})

it('Aroon scores bars since the latest extreme, and ties use the newest bar', () => {
  const store = new ColumnStore()
  store.setData(
    ohlc([
      [1, 1],
      [5, 0],
      [3, 2],
      [4, 0],
      [2, 1],
    ]),
  )
  const snap = snapshot(aroonDef, { period: 3 }, store)
  expect(snap.up![0]).toBeNaN()
  expect(snap.up![3]).toBeCloseTo(100 / 3, 8)
  expect(snap.down![3]).toBe(100)
  expect(snap.up![4]).toBe(0)
  expect(snap.down![4]).toBeCloseTo(200 / 3, 8)
})

describe('Ichimoku', () => {
  const options = { tenkan: 2, kijun: 3, senkou: 4, displacement: 2 }

  function load() {
    const store = new ColumnStore()
    store.setData(
      ohlc([
        [10, 8, 9],
        [12, 9, 11],
        [11, 7, 8],
        [13, 10, 12],
        [14, 11, 13],
        [12, 9, 10],
      ]),
    )
    const calc = ichimokuDef.create({
      ...ichimokuDef.defaultOptions,
      ...options,
    })
    calc.calculateAll(new StoreReader(store))
    return { store, calc }
  }

  it('shifts the cloud forward and the close back', () => {
    const { store, calc } = load()
    const at = (key: string) => [0, 1, 2, 3, 4, 5].map(i => calc.value(key, i))
    expect(at('tenkan')).toEqual([NaN, 10, 9.5, 10, 12, 11.5])
    expect(at('kijun')).toEqual([NaN, NaN, 9.5, 10, 10.5, 11.5])
    expect(at('spanA')).toEqual([NaN, NaN, NaN, NaN, 9.5, 10])
    expect(at('spanB')).toEqual([NaN, NaN, NaN, NaN, NaN, 10])
    expect(at('chikou')).toEqual([8, 12, 13, 10, NaN, NaN])
    // The last two source bars project past the data.
    expect(calc.value('spanA', store.lastIndex + 1)).toBe(11.25)
    expect(calc.value('spanB', store.lastIndex + 1)).toBe(10.5)
    expect(calc.value('spanA', store.lastIndex + 2)).toBe(11.5)
    expect(calc.value('spanB', store.lastIndex + 2)).toBe(10.5)
    // Equal spans meet in both fills; a span-A lead is the bull cloud only.
    expect(calc.value('bullHigh', 5)).toBe(10)
    expect(calc.value('bearLow', 5)).toBe(10)
    expect(calc.value('bullHigh', 6)).toBe(11.25)
    expect(calc.value('bearHigh', 6)).toBeNaN()
  })

  it('a live tick moves the lead and the lagged close, not the cloud already on older bars', () => {
    const { store, calc } = load()
    const reader = new StoreReader(store)
    const settled = calc.value('spanA', store.lastIndex)
    const last = store.get(store.lastIndex)
    store.push({ ...last, high: last.high + 4, close: last.close + 4 })
    calc.updateLast(reader)
    expect(calc.value('spanA', store.lastIndex)).toBe(settled)
    expect(calc.value('spanA', store.lastIndex + 2)).toBe(12.5)
    expect(calc.value('chikou', store.lastIndex - 2)).toBe(last.close + 4)
  })

  it('matches a full recompute when built one bar at a time and after backfill', () => {
    const data = bars(81)
    const resolved = {
      ...ichimokuDef.defaultOptions,
      tenkan: 3,
      kijun: 5,
      senkou: 8,
      displacement: 3,
    }
    const batchStore = new ColumnStore()
    batchStore.setData(data)
    const batch = snapshot(ichimokuDef, resolved, batchStore)

    const liveStore = new ColumnStore()
    const calc = ichimokuDef.create(resolved)
    const reader = new StoreReader(liveStore)
    for (const bar of data) {
      liveStore.push(bar)
      calc.updateLast(reader)
    }
    for (const { key } of ichimokuDef.plots(resolved)) {
      for (let i = liveStore.firstIndex; i <= liveStore.lastIndex + 3; i++) {
        const live = calc.value(key, i)
        const want =
          i <= batchStore.lastIndex
            ? batch[key]![i - batchStore.firstIndex]!
            : snapshotLead(ichimokuDef, resolved, data, key, i)
        if (Number.isNaN(want)) expect(live).toBeNaN()
        else expect(live).toBeCloseTo(want, 10)
      }
    }

    const backfill = new ColumnStore()
    const backReader = new StoreReader(backfill)
    const backCalc = ichimokuDef.create(resolved)
    backfill.setData(data.slice(40, 80))
    backCalc.calculateAll(backReader)
    backfill.prepend(data.slice(0, 40))
    backCalc.calculateAll(backReader)
    backfill.push(data[80]!)
    backCalc.updateLast(backReader)
    for (const { key } of ichimokuDef.plots(resolved)) {
      expect(
        data.map((_, offset) =>
          backCalc.value(key, backReader.firstIndex + offset),
        ),
      ).toEqual(batch[key])
    }
  })
})

/** One leading value from a fresh recompute, including slots past the last bar. */
function snapshotLead(
  def: AnyDef,
  options: Record<string, unknown>,
  data: Bar[],
  key: string,
  index: number,
): number {
  const store = new ColumnStore()
  store.setData(data)
  const calc = def.create({ ...def.defaultOptions, ...options })
  calc.calculateAll(new StoreReader(store))
  return calc.value(key, index)
}

/** `[high, low, close?, volume?]`, timed in order. Close defaults to the midpoint. */
function ohlc(
  rows: readonly (readonly [number, number, number?, number?])[],
): Bar[] {
  return rows.map(([high, low, close, volume], time) => {
    const price = close ?? (high + low) / 2
    return { time, open: price, high, low, close: price, volume }
  })
}

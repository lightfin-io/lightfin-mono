import { describe, expect, it } from 'vitest'

import { StoreReader } from '../data/barReader'
import { ColumnStore } from '../data/store'
import type { Bar } from '../data/types'
import adxDef from './adx'
import atrDef from './atr'
import bollingerDef from './bollinger'
import cciDef from './cci'
import emaDef from './ema'
import keltnerDef from './keltner'
import macdDef from './macd'
import obvDef from './obv'
import rocDef from './roc'
import rsiDef from './rsi'
import smaDef from './sma'
import stochasticDef from './stochastic'
import type { IndicatorDefinition } from './types'
import volumeMaDef from './volumeMa'
import vwapDef from './vwap'
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
]

describe.each(definitions)('%s indicator', (_name, def, options) => {
  const resolved = { ...def.defaultOptions, ...options }
  const keys = def.plots(resolved).map(p => p.key)

  it('warms up (first bar NaN) then produces finite values at the tail', () => {
    const store = new ColumnStore()
    store.setData(bars(80))
    const snap = snapshot(def, options, store)
    for (const key of keys) {
      // The first bar can never have a defined value (no prior history).
      expect(snap[key]![0]).toBeNaN()
      // With plenty of bars, every plot has produced finite output by the end.
      expect(Number.isFinite(snap[key]![snap[key]!.length - 1])).toBe(true)
    }
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
    const ticked: Bar = { ...last, close: last.close + 5, high: last.high + 5 }
    liveStore.push(ticked)
    calc.updateLast(reader)

    // Compare against a fresh recompute over the mutated dataset.
    const refStore = new ColumnStore()
    refStore.setData([...data.slice(0, -1), ticked])
    const ref = snapshot(def, options, refStore)
    for (const key of keys) {
      const live = calc.value(key, liveStore.lastIndex)
      const want = ref[key]![refStore.lastIndex - refStore.firstIndex]!
      expect(live).toBeCloseTo(want, 10)
    }
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

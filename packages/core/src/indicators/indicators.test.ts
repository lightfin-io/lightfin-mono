import { describe, expect, it } from 'vitest'

import { StoreReader } from '../data/barReader'
import { ColumnStore } from '../data/store'
import type { Bar } from '../data/types'
import atrDef from './atr'
import bollingerDef from './bollinger'
import emaDef from './ema'
import macdDef from './macd'
import rsiDef from './rsi'
import smaDef from './sma'
import stochasticDef from './stochastic'
import type { IndicatorDefinition } from './types'
import volumeMaDef from './volumeMa'

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
  ['Bollinger', bollingerDef as unknown as AnyDef, { period: 10, mult: 2 }],
  ['RSI', rsiDef as unknown as AnyDef, { period: 14 }],
  ['MACD', macdDef as unknown as AnyDef, {}],
  ['ATR', atrDef as unknown as AnyDef, { period: 14 }],
  [
    'Stochastic',
    stochasticDef as unknown as AnyDef,
    { kPeriod: 14, kSmooth: 3, dPeriod: 3 },
  ],
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

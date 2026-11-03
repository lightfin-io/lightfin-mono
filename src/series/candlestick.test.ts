import { describe, expect, it } from 'vitest'

import type { Bar } from '../data/types.ts'
import { TimeScale } from '../scales/timeScale.ts'
import { CandlestickSeries } from './candlestick.ts'

function bar(
  time: number,
  o: number,
  h: number,
  l: number,
  c: number,
  v?: number,
): Bar {
  return { time, open: o, high: h, low: l, close: c, volume: v }
}

function series(): CandlestickSeries {
  const s = new CandlestickSeries()
  s.setData([
    bar(10, 5, 8, 4, 7),
    bar(20, 7, 9, 6, 6),
    bar(30, 6, 11, 5, 10),
    bar(40, 10, 12, 3, 4),
  ])
  return s
}

describe('CandlestickSeries.visibleWindow', () => {
  it('clamps the visible range to the stored data', () => {
    const s = series()
    // Wide bars, scrolled to the start: all four in view, clamped to [0,3].
    const ts = new TimeScale(50, 0)
    expect(s.visibleWindow(ts, 1000)).toEqual({ from: 0, to: 3 })
  })

  it('returns a sub-window when scrolled into the middle', () => {
    const s = series()
    const ts = new TimeScale(50, 1) // left edge near bar 1
    const w = s.visibleWindow(ts, 100) // 100px / 50px = 2 slots wide
    expect(w.from).toBeGreaterThanOrEqual(0)
    expect(w.to).toBeLessThanOrEqual(3)
    expect(w.from).toBeLessThanOrEqual(w.to)
  })

  it('reports an empty window for an empty series', () => {
    const s = new CandlestickSeries()
    const ts = new TimeScale(10, 0)
    const w = s.visibleWindow(ts, 500)
    expect(w.from).toBeGreaterThan(w.to)
  })
})

describe('CandlestickSeries.priceRange', () => {
  it('spans min low to max high across the window', () => {
    const s = series()
    expect(s.priceRange({ from: 0, to: 3 })).toEqual({ low: 3, high: 12 })
  })

  it('narrows to the window', () => {
    const s = series()
    // bars 0..1: lows 4,6 highs 8,9
    expect(s.priceRange({ from: 0, to: 1 })).toEqual({ low: 4, high: 9 })
  })

  it('returns null for an empty window', () => {
    const s = series()
    expect(s.priceRange({ from: 2, to: 1 })).toBeNull()
  })
})

describe('CandlestickSeries.volumeMax', () => {
  function volSeries(): CandlestickSeries {
    const s = new CandlestickSeries()
    s.setData([
      bar(10, 5, 8, 4, 7, 100),
      bar(20, 7, 9, 6, 6, 500),
      bar(30, 6, 11, 5, 10, 300),
    ])
    return s
  }

  it('returns the largest volume across the window', () => {
    expect(volSeries().volumeMax({ from: 0, to: 2 })).toBe(500)
  })

  it('narrows to the window', () => {
    expect(volSeries().volumeMax({ from: 0, to: 0 })).toBe(100)
  })

  it('returns 0 when the series carries no volume', () => {
    expect(series().volumeMax({ from: 0, to: 3 })).toBe(0)
  })

  it('returns 0 for an empty window', () => {
    expect(volSeries().volumeMax({ from: 2, to: 1 })).toBe(0)
  })
})

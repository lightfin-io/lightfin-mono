import { describe, expect, it } from 'vitest'

import type { Bar } from '../data/types'
import { TimeScale } from '../scales/timeScale'
import { Series } from './series'

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

function series(): Series {
  const s = new Series()
  s.setData([
    bar(10, 5, 8, 4, 7),
    bar(20, 7, 9, 6, 6),
    bar(30, 6, 11, 5, 10),
    bar(40, 10, 12, 3, 4),
  ])
  return s
}

describe('Series.visibleWindow', () => {
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
    const s = new Series()
    const ts = new TimeScale(10, 0)
    const w = s.visibleWindow(ts, 500)
    expect(w.from).toBeGreaterThan(w.to)
  })
})

describe('Series change signals', () => {
  it('signals reset on setData', () => {
    const s = new Series()
    const seen: string[] = []
    s.onChange = c => seen.push(c)
    s.setData([bar(10, 5, 8, 4, 7)])
    expect(seen).toEqual(['reset'])
  })

  it('signals new-bar for a newer time and tick for an in-place update', () => {
    const s = series()
    const seen: string[] = []
    s.onChange = c => seen.push(c)
    s.update(bar(50, 4, 6, 3, 5)) // newer than last (40) → appends
    s.update(bar(50, 4, 7, 3, 6)) // same time → mutates in place
    expect(seen).toEqual(['new-bar', 'tick'])
    expect(s.store.size).toBe(5)
  })

  it('prepend backfills older bars, keeps logical indices, and signals prepend', () => {
    const s = series()
    const firstBefore = s.store.firstIndex // 0
    const lastBefore = s.store.lastIndex // 3
    const seen: string[] = []
    s.onChange = c => seen.push(c)

    s.prepend([bar(-10, 1, 2, 1, 2), bar(0, 2, 3, 1, 3)])

    expect(seen).toEqual(['prepend'])
    expect(s.store.size).toBe(6)
    // Older bars push firstIndex down; the newest bar keeps its logical index.
    expect(s.store.firstIndex).toBe(firstBefore - 2)
    expect(s.store.lastIndex).toBe(lastBefore)
    expect(s.store.get(lastBefore).time).toBe(40)
  })

  it('prepend of an empty array is a no-op and fires nothing', () => {
    const s = series()
    const seen: string[] = []
    s.onChange = c => seen.push(c)
    s.prepend([])
    expect(seen).toEqual([])
    expect(s.store.size).toBe(4)
  })
})

describe('Series.priceRange', () => {
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

  it('spans the full high/low range for OHLC bars', () => {
    const s = series()
    s.setChartType('bar')
    expect(s.priceRange({ from: 0, to: 3 })).toEqual({ low: 3, high: 12 })
  })

  it.each(['line', 'area'] as const)(
    'spans only the closes for %s cha',
    type => {
      const s = series()
      s.setChartType(type)
      // closes 7, 6, 10, 4 — wicks (high 12, low 3) are ignored.
      expect(s.priceRange({ from: 0, to: 3 })).toEqual({ low: 4, high: 10 })
    },
  )
})

describe('Series.setChartType', () => {
  it('defaults to candlestick, or the type passed to the constructor', () => {
    expect(new Series().chartType).toBe('candlestick')
    expect(new Series('area').chartType).toBe('area')
  })

  it('switches type and signals style, leaving the data untouched', () => {
    const s = series()
    const seen: string[] = []
    s.onChange = c => seen.push(c)
    s.setChartType('line')
    expect(s.chartType).toBe('line')
    expect(seen).toEqual(['style'])
    expect(s.store.size).toBe(4)
  })

  it('is a no-op when already of that type', () => {
    const s = series()
    const seen: string[] = []
    s.onChange = c => seen.push(c)
    s.setChartType('candlestick')
    expect(seen).toEqual([])
  })
})

describe('Series.snapPrice', () => {
  // Bar 3: open 10, high 12, low 3, close 4.
  it('snaps to the nearest of open/high/low/close', () => {
    const s = series()
    expect(s.snapPrice(3, 11.5)).toBe(12)
    expect(s.snapPrice(3, 9)).toBe(10)
    expect(s.snapPrice(3, 4.2)).toBe(4)
    expect(s.snapPrice(3, -50)).toBe(3)
  })

  it.each(['line', 'area'] as const)('snaps to the close for %s', type => {
    const s = series()
    s.setChartType(type)
    expect(s.snapPrice(3, 11.5)).toBe(4)
  })

  it('leaves the price alone outside the data', () => {
    expect(series().snapPrice(9, 7.5)).toBe(7.5)
  })
})

describe('Series.volumeMax', () => {
  function volSeries(): Series {
    const s = new Series()
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

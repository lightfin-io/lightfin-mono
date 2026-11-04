import { describe, expect, it } from 'vitest'

import { ColumnStore } from './store'
import type { Bar } from './types'

function bar(time: number, close = time, volume?: number): Bar {
  return {
    time,
    open: close - 1,
    high: close + 2,
    low: close - 2,
    close,
    ...(volume === undefined ? {} : { volume }),
  }
}

describe('ColumnStore.setData', () => {
  it('sorts by time and indexes from 0', () => {
    const s = new ColumnStore()
    s.setData([bar(30), bar(10), bar(20)])
    expect(s.size).toBe(3)
    expect(s.firstIndex).toBe(0)
    expect(s.lastIndex).toBe(2)
    expect(s.get(0).time).toBe(10)
    expect(s.get(2).time).toBe(30)
  })

  it('tracks whether any bar carried volume', () => {
    const s = new ColumnStore()
    s.setData([bar(1), bar(2)])
    expect(s.hasVolumeData).toBe(false)
    s.setData([bar(1, 1, 100), bar(2)])
    expect(s.hasVolumeData).toBe(true)
    expect(s.get(0).volume).toBe(100)
    expect(s.get(1).volume).toBeUndefined()
  })
})

describe('ColumnStore.push', () => {
  it('appends a strictly-newer bar as a new bar', () => {
    const s = new ColumnStore()
    s.setData([bar(10), bar(20)])
    const r = s.push(bar(30))
    expect(r).toEqual({ index: 2, isNewBar: true })
    expect(s.size).toBe(3)
    expect(s.get(2).time).toBe(30)
  })

  it('mutates the last bar in place when the time matches', () => {
    const s = new ColumnStore()
    s.setData([bar(10), bar(20)])
    const r = s.push({ time: 20, open: 5, high: 9, low: 4, close: 8 })
    expect(r).toEqual({ index: 1, isNewBar: false })
    expect(s.size).toBe(2)
    expect(s.get(1).close).toBe(8)
  })

  it('rejects a bar that predates the last bar', () => {
    const s = new ColumnStore()
    s.setData([bar(10), bar(20)])
    expect(() => s.push(bar(15))).toThrow(/precedes last bar/)
  })

  it('works on an empty store', () => {
    const s = new ColumnStore()
    const r = s.push(bar(10))
    expect(r.isNewBar).toBe(true)
    expect(s.size).toBe(1)
    expect(s.get(r.index).time).toBe(10)
  })
})

describe('ColumnStore.prepend (backfill) keeps logical indices stable', () => {
  it('decrements baseIndex so an old index still points at its bar', () => {
    const s = new ColumnStore()
    s.setData([bar(100), bar(110), bar(120)])
    // index 2 is the newest bar (time 120)
    const newestTimeBefore = s.get(2).time

    s.prepend([bar(70), bar(80), bar(90)])

    expect(s.size).toBe(6)
    expect(s.firstIndex).toBe(-3)
    expect(s.lastIndex).toBe(2)
    // The same logical index 2 still addresses time 120.
    expect(s.get(2).time).toBe(newestTimeBefore)
    expect(s.get(-3).time).toBe(70)
    expect(s.get(0).time).toBe(100)
  })

  it('setData on an empty store via prepend', () => {
    const s = new ColumnStore()
    s.prepend([bar(1), bar(2)])
    expect(s.size).toBe(2)
    expect(s.get(0).time).toBe(1)
  })
})

describe('ColumnStore reallocation', () => {
  it('survives many appends past initial capacity', () => {
    const s = new ColumnStore()
    s.setData([bar(0)])
    for (let t = 1; t < 5000; t++) s.push(bar(t))
    expect(s.size).toBe(5000)
    expect(s.firstIndex).toBe(0)
    expect(s.lastIndex).toBe(4999)
    expect(s.get(0).time).toBe(0)
    expect(s.get(4999).time).toBe(4999)
    expect(s.get(2500).time).toBe(2500)
  })

  it('survives many prepends past initial capacity with stable indices', () => {
    const s = new ColumnStore()
    s.setData([bar(10000)])
    for (let t = 9999; t >= 5000; t--) s.prepend([bar(t)])
    expect(s.size).toBe(5001)
    // 10000 was index 0 and must stay index 0 through every prepend.
    expect(s.get(0).time).toBe(10000)
    expect(s.firstIndex).toBe(-5000)
    expect(s.get(-5000).time).toBe(5000)
  })

  it('interleaves appends and prepends correctly', () => {
    const s = new ColumnStore()
    s.setData([bar(500)])
    for (let i = 0; i < 300; i++) {
      s.push(bar(501 + i))
      s.prepend([bar(499 - i)])
    }
    expect(s.size).toBe(601)
    expect(s.get(0).time).toBe(500)
    expect(s.lastIndex).toBe(300)
    expect(s.firstIndex).toBe(-300)
    expect(s.get(300).time).toBe(800)
    expect(s.get(-300).time).toBe(200)
  })
})

describe('ColumnStore.indexAtOrBefore', () => {
  const s = new ColumnStore()
  s.setData([bar(10), bar(20), bar(30), bar(40)])

  it('finds an exact match', () => {
    expect(s.indexAtOrBefore(30)).toBe(2)
  })

  it('rounds down to the previous bar between samples', () => {
    expect(s.indexAtOrBefore(25)).toBe(1)
  })

  it('returns the last bar for a time past the end', () => {
    expect(s.indexAtOrBefore(999)).toBe(3)
  })

  it('returns -1 before the first bar', () => {
    expect(s.indexAtOrBefore(5)).toBe(-1)
  })
})

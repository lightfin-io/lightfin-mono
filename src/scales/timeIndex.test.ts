import { describe, expect, it } from 'vitest'

import { ColumnStore } from '../data/store'
import { indexToTime, timeToIndex } from './timeIndex'

// Hourly bars at t = 0, 3600, 7200, then a gap (e.g. overnight) to 36000.
function store(): ColumnStore {
  const s = new ColumnStore()
  s.setData(
    [0, 3600, 7200, 36_000].map(time => ({
      time,
      open: 1,
      high: 1,
      low: 1,
      close: 1,
    })),
  )
  return s
}

describe('timeToIndex / indexToTime', () => {
  it('maps bar times to their whole index', () => {
    const s = store()
    expect(timeToIndex(s, 0, 3600)).toBe(0)
    expect(timeToIndex(s, 7200, 3600)).toBe(2)
    expect(timeToIndex(s, 36_000, 3600)).toBe(3)
    expect(indexToTime(s, 1, 3600)).toBe(3600)
  })

  it('interpolates between bars, across gaps by elapsed share', () => {
    const s = store()
    expect(timeToIndex(s, 1800, 3600)).toBeCloseTo(0.5)
    // A quarter of the way through the gap from 7200 to 36000.
    expect(timeToIndex(s, 14_400, 3600)).toBeCloseTo(2.25)
    expect(indexToTime(s, 2.25, 3600)).toBeCloseTo(14_400)
  })

  it('extrapolates past both ends at the bar interval', () => {
    const s = store()
    expect(timeToIndex(s, 36_000 + 2 * 3600, 3600)).toBe(5)
    expect(timeToIndex(s, -3 * 3600, 3600)).toBe(-3)
    expect(indexToTime(s, 5, 3600)).toBe(36_000 + 2 * 3600)
    expect(indexToTime(s, -3, 3600)).toBe(-3 * 3600)
  })

  it('keeps time anchors fixed when history is prepended', () => {
    const s = store()
    const before = timeToIndex(s, 7200, 3600)
    s.prepend([{ time: -3600, open: 1, high: 1, low: 1, close: 1 }])
    // Logical indices are stable under prepend, so the anchor doesn't move.
    expect(timeToIndex(s, 7200, 3600)).toBe(before)
  })

  it('is NaN with no data', () => {
    const s = new ColumnStore()
    expect(timeToIndex(s, 0, 60)).toBeNaN()
    expect(indexToTime(s, 0, 60)).toBeNaN()
  })
})

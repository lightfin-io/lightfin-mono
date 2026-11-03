import { describe, expect, it } from 'vitest'

import { timeAxisLabels } from './timeTicks.ts'

const HOUR = 3600
const JAN1 = Date.UTC(2024, 0, 1) / 1000

/** `count` evenly-spaced bars from JAN1, `stepSec` apart. */
function bars(
  count: number,
  stepSec: number,
): { index: number; time: number }[] {
  return Array.from({ length: count }, (_, i) => ({
    index: i,
    time: JAN1 + i * stepSec,
  }))
}

describe('timeAxisLabels', () => {
  it('returns nothing for no bars', () => {
    expect(timeAxisLabels([], 10, 90)).toEqual([])
  })

  it('labels each hour and shows the date at the day boundary', () => {
    // barWidth 90, target 90 → one label per hour bucket.
    const labels = timeAxisLabels(bars(6, HOUR), 90, 90)
    expect(labels.map(l => l.text)).toEqual([
      'Jan 1', // midnight → date, not 00:00
      '01:00',
      '02:00',
      '03:00',
      '04:00',
      '05:00',
    ])
  })

  it('switches to the date label when the day rolls over', () => {
    const labels = timeAxisLabels(bars(26, HOUR), 90, 90)
    const dayRoll = labels.find(l => l.index === 24)
    expect(dayRoll?.text).toBe('Jan 2')
  })

  it('coarsens to a daily step when bars are narrow, labeling boundaries only', () => {
    // Narrow bars → the step jumps to 1 day: one label per calendar day.
    const labels = timeAxisLabels(bars(48, HOUR), 4, 90)
    expect(labels.map(l => l.index)).toEqual([0, 24])
    expect(labels[1]!.text).toBe('2') // day-of-month at the Jan 2 boundary
  })

  it('never labels more often than once per bar', () => {
    // Very wide bars: minute-spaced data, one label per bar at most.
    const labels = timeAxisLabels(bars(5, 60), 200, 90)
    expect(labels.length).toBeLessThanOrEqual(5)
    expect(new Set(labels.map(l => l.index)).size).toBe(labels.length)
  })

  it('skips gaps — labels align to wall-clock buckets, not bar count', () => {
    // Hourly bars with a 2-day gap after the 3rd bar (weekend-style skip).
    const withGap = [
      { index: 0, time: JAN1 },
      { index: 1, time: JAN1 + HOUR },
      { index: 2, time: JAN1 + 2 * HOUR },
      { index: 3, time: JAN1 + 2 * 86400 }, // jumps to Jan 3 00:00
      { index: 4, time: JAN1 + 2 * 86400 + HOUR },
    ]
    const labels = timeAxisLabels(withGap, 90, 90)
    // The post-gap bar lands on a new day → shows its date.
    expect(labels.find(l => l.index === 3)?.text).toBe('Jan 3')
  })
})

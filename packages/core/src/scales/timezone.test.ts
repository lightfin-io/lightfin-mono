import { describe, expect, it } from 'vitest'

import { fromZoned, toZoned, tzOffsetSec } from './timezone'

const utc = (...args: [number, number, number, number?, number?]) =>
  Date.UTC(...args) / 1000

describe('tzOffsetSec', () => {
  it('is 0 for UTC or no timezone', () => {
    expect(tzOffsetSec(utc(2024, 0, 1), undefined)).toBe(0)
    expect(tzOffsetSec(utc(2024, 0, 1), 'UTC')).toBe(0)
  })

  it('follows DST in New York', () => {
    expect(tzOffsetSec(utc(2024, 0, 15), 'America/New_York')).toBe(-5 * 3600)
    expect(tzOffsetSec(utc(2024, 6, 15), 'America/New_York')).toBe(-4 * 3600)
  })

  it('switches exactly at the transition instant', () => {
    // US DST 2024 starts Mar 10 at 02:00 EST = 07:00 UTC.
    const t = utc(2024, 2, 10, 7)
    expect(tzOffsetSec(t - 1, 'America/New_York')).toBe(-5 * 3600)
    expect(tzOffsetSec(t, 'America/New_York')).toBe(-4 * 3600)
  })

  it('handles non-whole-hour zones', () => {
    expect(tzOffsetSec(utc(2024, 0, 1), 'Asia/Kolkata')).toBe(5.5 * 3600)
    expect(tzOffsetSec(utc(2024, 0, 1), 'Asia/Kathmandu')).toBe(5.75 * 3600)
  })
})

describe('toZoned / fromZoned', () => {
  it('round-trips', () => {
    for (const tz of ['America/New_York', 'Europe/London', 'Asia/Tokyo']) {
      for (const t of [utc(2024, 0, 1, 12), utc(2024, 6, 1, 3, 30)]) {
        expect(fromZoned(toZoned(t, tz), tz)).toBe(t)
      }
    }
  })

  it('reads wall-clock time as local to the zone', () => {
    // 09:30 in New York on Jan 2 2024 is 14:30 UTC.
    expect(fromZoned(utc(2024, 0, 2, 9, 30), 'America/New_York')).toBe(
      utc(2024, 0, 2, 14, 30),
    )
  })
})

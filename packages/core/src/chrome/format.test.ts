import { describe, expect, it } from 'vitest'

import { resolveOptions } from '../chart/options'
import {
  dateRangeStart,
  formatChange,
  formatClock,
  formatVolume,
  fromDateTimeInputs,
  toDateTimeInputs,
} from './format'

const utc = (...args: [number, number, number, number?, number?]) =>
  Date.UTC(...args) / 1000

describe('formatVolume', () => {
  it('abbreviates with trimmed decimals', () => {
    expect(formatVolume(999)).toBe('999')
    expect(formatVolume(1234)).toBe('1.23K')
    expect(formatVolume(5_600_000)).toBe('5.6M')
    expect(formatVolume(2e9)).toBe('2B')
    expect(formatVolume(1.5)).toBe('1.5')
    expect(formatVolume(NaN)).toBe('—')
  })
})

describe('formatChange', () => {
  const fmt = (p: number) => p.toFixed(2)
  it('signs the change and its percentage', () => {
    expect(formatChange(2, 100, fmt)).toBe('+2.00 (+2.00%)')
    expect(formatChange(-1.5, 50, fmt)).toBe('−1.50 (−3.00%)')
    expect(formatChange(0, 50, fmt)).toBe('0.00 (0.00%)')
  })
})

describe('formatClock', () => {
  it('renders wall-clock time with a UTC offset', () => {
    const d = new Date(utc(2024, 0, 2, 14, 30) * 1000)
    expect(formatClock(d)).toBe('14:30:00 UTC')
    expect(formatClock(d, 'America/New_York')).toBe('09:30:00 UTC-5')
    expect(formatClock(d, 'Asia/Kolkata')).toBe('20:00:00 UTC+5:30')
  })

  it('uses the chart locale for the wall-clock time', () => {
    const d = new Date(Date.UTC(2024, 0, 2, 19, 30, 5))
    const { dateFormatters } = resolveOptions({ locale: 'en-US' })
    expect(
      formatClock(d, 'America/New_York', dateFormatters.timeWithSeconds),
    ).toBe('2:30:05 PM UTC-5')
  })
})

describe('dateRangeStart', () => {
  const end = utc(2024, 4, 15, 16) // May 15 2024 16:00 UTC

  it('steps back on the calendar', () => {
    expect(dateRangeStart('1D', end)).toBe(utc(2024, 4, 14, 16))
    expect(dateRangeStart('5D', end)).toBe(utc(2024, 4, 10, 16))
    expect(dateRangeStart('3M', end)).toBe(utc(2024, 1, 15, 16))
    expect(dateRangeStart('1Y', end)).toBe(utc(2023, 4, 15, 16))
    expect(dateRangeStart('All', end)).toBeNull()
  })

  it('starts YTD at local midnight on Jan 1', () => {
    expect(dateRangeStart('YTD', end)).toBe(utc(2024, 0, 1))
    // Midnight Jan 1 in New York is 05:00 UTC.
    expect(dateRangeStart('YTD', end, 'America/New_York')).toBe(
      utc(2024, 0, 1, 5),
    )
  })
})

describe('date/time inputs', () => {
  it('round-trips through the zone wall clock', () => {
    const t = utc(2024, 0, 2, 14, 30)
    const inputs = toDateTimeInputs(t, 'America/New_York')
    expect(inputs).toEqual({ date: '2024-01-02', time: '09:30' })
    expect(
      fromDateTimeInputs(inputs.date, inputs.time, 'America/New_York'),
    ).toBe(t)
  })

  it('rejects an empty date', () => {
    expect(fromDateTimeInputs('', '10:00')).toBeNull()
  })
})

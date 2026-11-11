import { DEFAULT_DATE_FORMATTERS } from '../chart/options'
import { fromZoned, toZoned, tzOffsetSec } from '../scales/timezone'

/** Compact volume, e.g. 1234 → "1.23K", 5_600_000 → "5.6M". */
export function formatVolume(value: number): string {
  if (!Number.isFinite(value)) return '—'
  const abs = Math.abs(value)
  const units: [number, string][] = [
    [1e12, 'T'],
    [1e9, 'B'],
    [1e6, 'M'],
    [1e3, 'K'],
  ]
  for (const [size, suffix] of units) {
    if (abs >= size) return `${trimZeros((value / size).toFixed(2))}${suffix}`
  }
  return trimZeros(value.toFixed(abs < 10 ? 2 : 0))
}

function trimZeros(s: string): string {
  return s.includes('.') ? s.replace(/\.?0+$/, '') : s
}

/** A signed change, e.g. "+1.25 (+0.84%)". */
export function formatChange(
  change: number,
  base: number,
  formatPrice: (price: number) => string,
): string {
  const sign = change > 0 ? '+' : change < 0 ? '−' : ''
  const pct = base !== 0 ? (Math.abs(change) / Math.abs(base)) * 100 : 0
  return `${sign}${formatPrice(Math.abs(change))} (${sign}${pct.toFixed(2)}%)`
}

/**
 * Wall-clock time + "UTC±H" offset for `date` in `timeZone` (UTC when omitted),
 * e.g. "14:30:05 UTC-5". The time digits are rendered by `formatTime` (the
 * chart's {@link DateFormatters.timeWithSeconds}, defaulting to the 24-hour
 * built-in), which receives a wall-clock-as-UTC Date; the offset is appended
 * separately so it survives localization.
 */
export function formatClock(
  date: Date,
  timeZone?: string,
  formatTime: (date: Date) => string = DEFAULT_DATE_FORMATTERS.timeWithSeconds,
): string {
  const offsetSec = tzOffsetSec(Math.floor(date.getTime() / 1000), timeZone)
  const wall = new Date(date.getTime() + offsetSec * 1000)
  return `${formatTime(wall)} ${formatOffset(offsetSec)}`
}

/** A UTC offset in seconds as "UTC", "UTC-5", or "UTC+5:30". */
function formatOffset(offsetSec: number): string {
  if (offsetSec === 0) return 'UTC'
  const sign = offsetSec > 0 ? '+' : '-'
  const abs = Math.abs(offsetSec)
  const hours = Math.floor(abs / 3600)
  const mins = Math.floor((abs % 3600) / 60)
  return mins ? `UTC${sign}${hours}:${pad(mins)}` : `UTC${sign}${hours}`
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

/** Quick date-range presets for the bottom toolbar (PLAN §9). */
export type DateRangePreset =
  '1D' | '5D' | '1M' | '3M' | '6M' | 'YTD' | '1Y' | '5Y' | 'All'

export const DATE_RANGE_PRESETS: readonly DateRangePreset[] = [
  '1D',
  '5D',
  '1M',
  '3M',
  '6M',
  'YTD',
  '1Y',
  '5Y',
  'All',
]

/**
 * Start time (Unix seconds UTC) of a preset range ending at `end`, measured
 * on the wall clock of `timeZone` so "1M" and "YTD" land on calendar
 * boundaries there. Null for "All".
 */
export function dateRangeStart(
  preset: DateRangePreset,
  end: number,
  timeZone?: string,
): number | null {
  const d = new Date(toZoned(end, timeZone) * 1000)
  switch (preset) {
    case '1D':
      d.setUTCDate(d.getUTCDate() - 1)
      break
    case '5D':
      d.setUTCDate(d.getUTCDate() - 5)
      break
    case '1M':
      d.setUTCMonth(d.getUTCMonth() - 1)
      break
    case '3M':
      d.setUTCMonth(d.getUTCMonth() - 3)
      break
    case '6M':
      d.setUTCMonth(d.getUTCMonth() - 6)
      break
    case 'YTD':
      d.setUTCMonth(0, 1)
      d.setUTCHours(0, 0, 0, 0)
      break
    case '1Y':
      d.setUTCFullYear(d.getUTCFullYear() - 1)
      break
    case '5Y':
      d.setUTCFullYear(d.getUTCFullYear() - 5)
      break
    case 'All':
      return null
  }
  return fromZoned(Math.floor(d.getTime() / 1000), timeZone)
}

/** "YYYY-MM-DD" and "HH:MM" of a UTC timestamp on `timeZone`'s wall clock. */
export function toDateTimeInputs(
  timeSec: number,
  timeZone?: string,
): { date: string; time: string } {
  const iso = new Date(toZoned(timeSec, timeZone) * 1000).toISOString()
  return { date: iso.slice(0, 10), time: iso.slice(11, 16) }
}

/**
 * Parse `<input type=date>` / `<input type=time>` values as wall-clock time in
 * `timeZone` → Unix seconds UTC. Null when the date is empty or invalid.
 */
export function fromDateTimeInputs(
  date: string,
  time: string,
  timeZone?: string,
): number | null {
  if (!date) return null
  const ms = Date.parse(`${date}T${time || '00:00'}:00Z`)
  if (Number.isNaN(ms)) return null
  return fromZoned(ms / 1000, timeZone)
}

import { fromZoned, toZoned } from '../scales/timezone'

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

const clockFormatters = new Map<string, Intl.DateTimeFormat>()

/** Wall-clock "HH:MM:SS UTC±H" for `date` in `timeZone` (UTC when omitted). */
export function formatClock(date: Date, timeZone = 'UTC'): string {
  let fmt = clockFormatters.get(timeZone)
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
      timeZoneName: 'shortOffset',
    })
    clockFormatters.set(timeZone, fmt)
  }
  let time = ''
  let zone = ''
  for (const p of fmt.formatToParts(date)) {
    if (p.type === 'timeZoneName') zone = p.value
    else if (p.type !== 'literal' || !zone) time += p.value
  }
  return `${time.trim()} ${zone.replace(/^GMT/, 'UTC').replace(/^UTC[+-]0$/, 'UTC')}`
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

/**
 * IANA timezone offsets via `Intl.DateTimeFormat` (PLAN §6) — no tz database
 * shipped. Used to render axis/crosshair labels and the exchange clock in the
 * instrument's timezone.
 *
 * Offsets are cached per 15-minute block: every real-world DST transition and
 * zone offset falls on a 15-minute boundary, so the offset at a block's start
 * holds for the whole block, and a pan across thousands of bars costs a
 * handful of `Intl` calls instead of one per bar.
 */

const BLOCK_SEC = 900
const MAX_CACHED_BLOCKS = 20_000

const formatters = new Map<string, Intl.DateTimeFormat>()
const offsetCache = new Map<string, Map<number, number>>()

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let fmt = formatters.get(timeZone)
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    })
    formatters.set(timeZone, fmt)
  }
  return fmt
}

function isUtc(timeZone: string | undefined): boolean {
  return !timeZone || timeZone === 'UTC' || timeZone === 'Etc/UTC'
}

/**
 * Seconds to add to a UTC timestamp to get wall-clock time in `timeZone`
 * (e.g. -18000 for New York in winter). 0 for UTC or when omitted.
 */
export function tzOffsetSec(timeSec: number, timeZone?: string): number {
  if (isUtc(timeZone)) return 0
  const tz = timeZone!
  let cache = offsetCache.get(tz)
  if (!cache) {
    cache = new Map()
    offsetCache.set(tz, cache)
  }
  const block = Math.floor(timeSec / BLOCK_SEC)
  const hit = cache.get(block)
  if (hit !== undefined) return hit

  const at = block * BLOCK_SEC
  const parts: Record<string, number> = {}
  for (const p of formatterFor(tz).formatToParts(new Date(at * 1000))) {
    if (p.type !== 'literal') parts[p.type] = Number(p.value)
  }
  const wall = Date.UTC(
    parts.year!,
    parts.month! - 1,
    parts.day!,
    parts.hour!,
    parts.minute!,
    parts.second!,
  )
  const offset = wall / 1000 - at
  if (cache.size >= MAX_CACHED_BLOCKS) cache.clear()
  cache.set(block, offset)
  return offset
}

/** UTC timestamp → the same instant as wall-clock seconds in `timeZone`. */
export function toZoned(timeSec: number, timeZone?: string): number {
  return timeSec + tzOffsetSec(timeSec, timeZone)
}

/**
 * Wall-clock seconds in `timeZone` → UTC timestamp. Inverse of
 * {@link toZoned}; a wall time skipped by a DST jump resolves to the instant
 * just after it.
 */
export function fromZoned(wallSec: number, timeZone?: string): number {
  const guess = wallSec - tzOffsetSec(wallSec, timeZone)
  return wallSec - tzOffsetSec(guess, timeZone)
}

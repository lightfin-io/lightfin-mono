/**
 * Interval-aware, index-based time-axis labels (PLAN §7, §14).
 *
 * The X axis is index-based (uniform bar spacing), so this never sees a
 * continuous time domain — only the (index, time) pairs actually in view. From
 * the dominant bar interval and the current `barWidth` it picks a "nice" step
 * off a standard ladder (1s/5s/15s/30s · 1m/5m/15m/30m · 1H/2H/4H · 1D/1W · 1M ·
 * 1Y), then labels the first visible bar that enters each round wall-clock
 * bucket — so labels land on round boundaries and skip gaps (weekends/overnight)
 * for free. Label text adapts to the step: time-of-day within a day, the date at
 * day boundaries, month at month boundaries, year at year boundaries.
 *
 * All formatting is UTC so headless rendering is deterministic for tests and
 * screenshot diffing (PLAN §12).
 */

export interface TimeAxisLabel {
  /** Logical bar index the label sits on. */
  index: number
  /** That bar's timestamp (Unix seconds UTC). */
  time: number
  text: string
}

type Granularity = 'second' | 'minute' | 'hour' | 'day' | 'month' | 'year'

interface TimeStep {
  /** Approximate seconds per step — used only to pick off the ladder. */
  sec: number
  gran: Granularity
  /** Maps a timestamp to its integer bucket; a bucket change marks a boundary. */
  bucket: (timeSec: number) => number
}

const SECONDS_PER_MONTH = 2_629_800 // 30.44 days, average
const SECONDS_PER_YEAR = 31_557_600 // 365.25 days

const bucketBySec =
  (size: number) =>
  (t: number): number =>
    Math.floor(t / size)

// Epoch (1970-01-01) is a Thursday; shift so week buckets break on Monday 00:00 UTC.
const weekBucket = (t: number): number => Math.floor((t + 259_200) / 604_800)
const monthBucket = (t: number): number => {
  const d = new Date(t * 1000)
  return d.getUTCFullYear() * 12 + d.getUTCMonth()
}
const yearBucket = (t: number): number => new Date(t * 1000).getUTCFullYear()

/** Ascending by `sec`; the first rung whose `sec` ≥ the target spacing wins. */
const TIME_STEPS: readonly TimeStep[] = [
  { sec: 1, gran: 'second', bucket: bucketBySec(1) },
  { sec: 5, gran: 'second', bucket: bucketBySec(5) },
  { sec: 15, gran: 'second', bucket: bucketBySec(15) },
  { sec: 30, gran: 'second', bucket: bucketBySec(30) },
  { sec: 60, gran: 'minute', bucket: bucketBySec(60) },
  { sec: 300, gran: 'minute', bucket: bucketBySec(300) },
  { sec: 900, gran: 'minute', bucket: bucketBySec(900) },
  { sec: 1800, gran: 'minute', bucket: bucketBySec(1800) },
  { sec: 3600, gran: 'hour', bucket: bucketBySec(3600) },
  { sec: 7200, gran: 'hour', bucket: bucketBySec(7200) },
  { sec: 14400, gran: 'hour', bucket: bucketBySec(14400) },
  { sec: 86400, gran: 'day', bucket: bucketBySec(86400) },
  { sec: 604800, gran: 'day', bucket: weekBucket },
  { sec: SECONDS_PER_MONTH, gran: 'month', bucket: monthBucket },
  { sec: SECONDS_PER_YEAR, gran: 'year', bucket: yearBucket },
]

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
]

/**
 * Pick time-axis labels for the visible bars so they sit ~`targetPx` apart at
 * the current `barWidth`, aligned to round wall-clock boundaries. `bars` must be
 * ascending by index/time. Returns a labeled subset, ascending.
 */
export function timeAxisLabels(
  bars: readonly { index: number; time: number }[],
  barWidth: number,
  targetPx: number,
): TimeAxisLabel[] {
  if (bars.length === 0) return []

  const interval = inferInterval(bars)
  // Never label more often than once per bar; otherwise aim for `targetPx`.
  const minGap = Math.max(interval, (targetPx / barWidth) * interval)
  const step = chooseTimeStep(minGap)

  const out: TimeAxisLabel[] = []
  let prevBucket: number | null = null
  let prevDate: Date | null = null
  for (const { index, time } of bars) {
    const bucket = step.bucket(time)
    if (bucket === prevBucket) continue // same bucket → one label per boundary
    prevBucket = bucket
    const d = new Date(time * 1000)
    out.push({ index, time, text: formatTick(step.gran, d, prevDate) })
    prevDate = d
  }
  return out
}

/** Smallest ladder rung whose step ≥ `minGapSec`, capped at the 1Y rung. */
function chooseTimeStep(minGapSec: number): TimeStep {
  for (const step of TIME_STEPS) {
    if (step.sec >= minGapSec) return step
  }
  return TIME_STEPS[TIME_STEPS.length - 1]!
}

/** Median positive gap between consecutive bars — robust to data gaps. */
function inferInterval(
  bars: readonly { index: number; time: number }[],
): number {
  if (bars.length < 2) return 1
  const deltas: number[] = []
  for (let i = 1; i < bars.length; i++) {
    const d = bars[i]!.time - bars[i - 1]!.time
    if (d > 0) deltas.push(d)
  }
  if (deltas.length === 0) return 1
  deltas.sort((a, b) => a - b)
  return deltas[deltas.length >> 1]!
}

/**
 * Label text for a tick, given the step granularity and the previously emitted
 * label's date — so the higher-order field (date/month/year) is shown only when
 * it changes, and the finer field fills the rest.
 */
function formatTick(gran: Granularity, d: Date, prev: Date | null): string {
  const year = d.getUTCFullYear()
  const newYear = !prev || prev.getUTCFullYear() !== year
  const newMonth = newYear || (!!prev && prev.getUTCMonth() !== d.getUTCMonth())
  const newDay = newMonth || (!!prev && prev.getUTCDate() !== d.getUTCDate())
  const monthDay = `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`

  switch (gran) {
    case 'second':
      return newDay
        ? monthDay
        : `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`
    case 'minute':
    case 'hour':
      return newDay
        ? monthDay
        : `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`
    case 'day':
      if (newYear) return String(year)
      if (newMonth) return MONTHS[d.getUTCMonth()]!
      return String(d.getUTCDate())
    case 'month':
      return newYear ? String(year) : MONTHS[d.getUTCMonth()]!
    case 'year':
      return String(year)
  }
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

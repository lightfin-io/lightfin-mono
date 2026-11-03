import type { Bar } from 'lightfin-web-chart'

/**
 * Deterministic pseudo-random OHLC walk for the demo / manual QA. Seeded so the
 * playground (and future Playwright screenshots) render the same bars every
 * time.
 */
export function generateBars(
  count: number,
  options: {
    startTime?: number
    intervalSec?: number
    startPrice?: number
  } = {},
): Bar[] {
  const startTime = options.startTime ?? Date.UTC(2024, 0, 1) / 1000
  const intervalSec = options.intervalSec ?? 3600 // hourly
  let price = options.startPrice ?? 100

  const rand = mulberry32(0x9e3779b9)
  const bars: Bar[] = []
  for (let i = 0; i < count; i++) {
    const drift = (rand() - 0.5) * 2
    const open = price
    const close = Math.max(1, open + drift + Math.sin(i / 20) * 0.6)
    const high = Math.max(open, close) + rand() * 1.5
    const low = Math.min(open, close) - rand() * 1.5
    const volume = 500 + rand() * 1500
    bars.push({
      time: startTime + i * intervalSec,
      open,
      high,
      low,
      close,
      volume,
    })
    price = close
  }
  return bars
}

/** Small fast seeded PRNG so the walk is reproducible. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

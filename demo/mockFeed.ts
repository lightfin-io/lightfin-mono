import type { Bar, DataSource } from 'lightfin-web-chart'

/**
 * A deterministic mock market feed for the demo / manual QA, implementing the
 * library's {@link DataSource} contract (PLAN §6). Price is a pure, smooth
 * function of time, so history (`getBars`, panning left) and the live stream
 * (`subscribeLive`) stay perfectly continuous and reproducible.
 *
 * Returns the {@link DataSource} plus an `initial()` helper for the bars to seed
 * the chart with before attaching the source.
 */
export interface MockFeed {
  source: DataSource
  /** A batch of recent complete bars to `setData()` before attaching `source`. */
  initial(): Bar[]
}

export interface MockFeedOptions {
  /** Seconds per bar (the synthetic candle period). */
  intervalSec?: number
  /** How many complete bars to seed the chart with. */
  initialCount?: number
  /** Wall-clock ms between live ticks. */
  tickMs?: number
  /** Synthetic seconds the clock advances per tick (defaults to ~20 ticks/bar). */
  stepSec?: number
  startPrice?: number
  /** Synthetic time at which live forming begins (newest seeded bar ends here). */
  anchorTime?: number
}

export function createMockFeed(options: MockFeedOptions = {}): MockFeed {
  const interval = options.intervalSec ?? 60
  const initialCount = options.initialCount ?? 200
  const tickMs = options.tickMs ?? 200
  const stepSec = options.stepSec ?? interval / 20
  const startPrice = options.startPrice ?? 100
  const anchor = options.anchorTime ?? Math.floor(Date.UTC(2024, 0, 1) / 1000)

  /** Smooth, layered, deterministic price curve as a function of time (seconds). */
  function priceAt(tSec: number): number {
    const u = tSec / interval
    const noise =
      (valueNoise(u * 0.25) - 0.5) * 48 +
      (valueNoise(u * 1.3) - 0.5) * 14 +
      (valueNoise(u * 6.0) - 0.5) * 4
    return Math.max(1, startPrice + noise)
  }

  /** OHLC+V for the slice of a candle from its period start `ps` up to time `end`. */
  function buildBar(ps: number, end: number): Bar {
    const open = priceAt(ps)
    let high = open
    let low = open
    let close = open
    const samples = 8
    for (let i = 1; i <= samples; i++) {
      const p = priceAt(ps + ((end - ps) * i) / samples)
      if (p > high) high = p
      if (p < low) low = p
      close = p
    }
    const volume = 400 + valueNoise(ps / interval + 0.5) * 1800
    return { time: ps, open, high, low, close, volume }
  }

  function initial(): Bar[] {
    const bars: Bar[] = []
    for (let k = initialCount; k >= 1; k--) {
      const ps = anchor - k * interval
      bars.push(buildBar(ps, ps + interval))
    }
    return bars
  }

  const source: DataSource = {
    getBars({ from, to }) {
      const bars: Bar[] = []
      const firstPs = Math.ceil(from / interval) * interval
      for (let ps = firstPs; ps <= to; ps += interval) {
        bars.push(buildBar(ps, ps + interval))
      }
      return bars
    },

    subscribeLive(onBar) {
      let now = anchor
      let lastPs = anchor - interval // so the first emitted period is new
      const timer = setInterval(() => {
        now += stepSec
        const ps = Math.floor(now / interval) * interval
        const isNewBar = ps > lastPs
        onBar(buildBar(ps, now), isNewBar)
        lastPs = ps
      }, tickMs)
      return () => clearInterval(timer)
    },
  }

  return { source, initial }
}

/** Hash an integer to [0, 1). */
function hash(n: number): number {
  const x = Math.sin(n * 127.1) * 43758.5453
  return x - Math.floor(x)
}

/** Smooth (smoothstep-interpolated) value noise over a real coordinate. */
function valueNoise(t: number): number {
  const i = Math.floor(t)
  const f = t - i
  const a = hash(i)
  const b = hash(i + 1)
  const u = f * f * (3 - 2 * f)
  return a + (b - a) * u
}

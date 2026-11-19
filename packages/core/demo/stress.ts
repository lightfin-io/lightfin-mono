import { type Bar, createChart } from '@lightfin/core'
import { createChrome } from '@lightfin/core/chrome'

import './style.css'

/**
 * 500k-candle stress page. Loads a large synthetic 1m
 * series with the demo's indicator set, then measures what scales with data
 * size: ingest, indicator calc, backfill recompute, and per-frame paint cost
 * while panning, zooming, and streaming live ticks. `?bars=N` overrides the
 * bar count.
 */

const BAR_COUNT = Number(
  new URLSearchParams(location.search).get('bars') ?? 500_000,
)
const INTERVAL = 60
const BACKFILL_COUNT = 50_000
const BENCH_FRAMES = 240

// Private chart methods the page instruments. Not public API — a dev page only.
interface ChartInternals {
  paint(dirty: ReadonlySet<string>): void
  onPan(dx: number): void
  onZoom(factor: number, anchorX: number): void
}

const container = document.querySelector<HTMLDivElement>('#chart')!
const panel = document.querySelector<HTMLElement>('#panel')!

const timings: [string, number][] = []
function timed<T>(label: string, fn: () => T): T {
  const t0 = performance.now()
  const result = fn()
  timings.push([label, performance.now() - t0])
  return result
}

const endTime = Math.floor(Date.UTC(2026, 0, 1) / 1000)
let oldestTime = endTime - BAR_COUNT * INTERVAL
let walkSeed = 1
const bars = timed(`generate ${fmtCount(BAR_COUNT)} bars`, () =>
  generateBars(BAR_COUNT, oldestTime, 100, walkSeed++),
)

const chart = createChart(container, { volumeVisible: true })
chart.setInstrument({
  symbol: 'STRESS',
  name: `${fmtCount(BAR_COUNT)} × 1m synthetic`,
  exchange: 'BENCH',
  timezone: 'UTC',
  pricePrecision: 2,
})
const candles = chart.addCandlestickSeries()
timed('setData', () => candles.setData(bars))

const internals = chart as unknown as ChartInternals

// Paint cost per frame, split by whether the series layer repainted (pan, zoom,
// data) or only the overlay did (crosshair moves).
const fullPaints: number[] = []
const overlayPaints: number[] = []
const paint = internals.paint.bind(chart)
internals.paint = dirty => {
  const t0 = performance.now()
  paint(dirty)
  const ms = performance.now() - t0
  const sink = dirty.has('series') ? fullPaints : overlayPaints
  sink.push(ms)
  if (sink.length > 600) sink.shift()
}

createChrome(chart, { intervals: ['1m'], interval: '1m' })

const modules = await Promise.all([
  import('@lightfin/core/indicators/sma'),
  import('@lightfin/core/indicators/ema'),
  import('@lightfin/core/indicators/bollinger'),
  import('@lightfin/core/indicators/rsi'),
  import('@lightfin/core/indicators/macd'),
  import('@lightfin/core/indicators/volumeMa'),
])
const indicatorOptions: Record<string, unknown>[] = [
  { period: 20, color: '#2962ff' },
  { period: 50, color: '#ff6d00' },
  { period: 20, mult: 2 },
  {},
  {},
  {},
]
for (const [i, mod] of modules.entries()) {
  const t0 = performance.now()
  await chart.addIndicator(mod, indicatorOptions[i])
  timings.push([`calc ${mod.default.name}`, performance.now() - t0])
}

// Benchmarks ---------------------------------------------------------------

interface BenchResult {
  label: string
  paintAvg: number
  paintP95: number
  paintMax: number
  frameAvg: number
  frameMax: number
}
const results: BenchResult[] = []
let running = false

/** Drive `step(frame)` once per animation frame and record paint/frame times. */
async function bench(
  label: string,
  step: (frame: number) => void,
): Promise<void> {
  if (running) return
  running = true
  fullPaints.length = 0
  const frames: number[] = []
  let last = performance.now()
  await new Promise<void>(resolve => {
    let frame = 0
    const tick = (now: number) => {
      if (frame > 0) frames.push(now - last)
      last = now
      if (frame === BENCH_FRAMES) return resolve()
      step(frame++)
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
  const paints = fullPaints.slice()
  results.unshift({
    label: `${label} @ ${chart.timeScale().barWidth.toFixed(2)}px`,
    paintAvg: avg(paints),
    paintP95: pct(paints, 0.95),
    paintMax: Math.max(...paints),
    frameAvg: avg(frames),
    frameMax: Math.max(...frames),
  })
  running = false
  render()
}

function centerX(): number {
  return chart.plotRect().width / 2
}

const benchmarks: Record<string, () => Promise<void>> = {
  'Pan sweep': () =>
    bench('pan', f => internals.onPan(f < BENCH_FRAMES / 2 ? 60 : -60)),
  'Zoom out ↔ in': () => {
    // Out to the minimum bar width and back to where it started.
    const start = chart.timeScale().barWidth
    const half = BENCH_FRAMES / 2
    return bench('zoom', f => {
      const target = start * 0.95 ** (f < half ? f + 1 : BENCH_FRAMES - f - 1)
      internals.onZoom(target / chart.timeScale().barWidth, centerX())
    })
  },
  'Fit all': async () => {
    chart.fitContent()
    render()
  },
  'Live ticks': () => {
    let price =
      candles.store.closes[candles.store.physical(candles.store.lastIndex)]!
    return bench('live (60 ticks/s, new bar every 10)', f => {
      const store = candles.store
      const last = store.get(store.lastIndex)
      price *= Math.exp((Math.random() - 0.5) * 0.002)
      if (f % 10 === 9) {
        candles.update({
          time: last.time + INTERVAL,
          open: last.close,
          high: Math.max(last.close, price),
          low: Math.min(last.close, price),
          close: price,
          volume: 100,
        })
      } else {
        candles.update({
          ...last,
          high: Math.max(last.high, price),
          low: Math.min(last.low, price),
          close: price,
          volume: (last.volume ?? 0) + 10,
        })
      }
    })
  },
  [`Backfill ${fmtCount(BACKFILL_COUNT)}`]: async () => {
    const firstOpen =
      candles.store.opens[candles.store.physical(candles.store.firstIndex)]!
    oldestTime -= BACKFILL_COUNT * INTERVAL
    const older = generateBars(
      BACKFILL_COUNT,
      oldestTime,
      firstOpen,
      walkSeed++,
    )
    timed(
      `prepend ${fmtCount(BACKFILL_COUNT)} (→ ${fmtCount(candles.store.size + BACKFILL_COUNT)})`,
      () => candles.prepend(older),
    )
    render()
  },
}

// Panel --------------------------------------------------------------------

function render(): void {
  const store = candles.store
  const plot = chart.plotRect()
  const barWidth = chart.timeScale().barWidth
  panel.innerHTML = `
    <h2>Stress: ${fmtCount(store.size)} bars</h2>
    <dl>
      <dt>Visible bars</dt><dd>${Math.round(plot.width / barWidth).toLocaleString()}</dd>
      <dt>Bar width</dt><dd>${barWidth.toFixed(2)} px</dd>
      <dt>Device pixel ratio</dt><dd>${devicePixelRatio}</dd>
    </dl>
    <h3>Load (ms)</h3>
    <dl>${timings.map(([k, v]) => `<dt>${k}</dt><dd>${v.toFixed(1)}</dd>`).join('')}</dl>
    <h3>Paint (ms, last ${fullPaints.length})</h3>
    <dl>
      <dt>Full avg / p95 / max</dt><dd>${stats(fullPaints)}</dd>
      <dt>Overlay avg / p95 / max</dt><dd>${stats(overlayPaints)}</dd>
    </dl>
    <h3>Benchmarks (${BENCH_FRAMES} frames)</h3>
    <div class="actions">${Object.keys(benchmarks)
      .map(
        k =>
          `<button data-bench="${k}" ${running ? 'disabled' : ''}>${k}</button>`,
      )
      .join('')}</div>
    <table>
      <tr><th></th><th>paint avg</th><th>p95</th><th>max</th><th>frame avg</th><th>max</th></tr>
      ${results
        .map(
          r =>
            `<tr><td>${r.label}</td>${[
              r.paintAvg,
              r.paintP95,
              r.paintMax,
              r.frameAvg,
              r.frameMax,
            ]
              .map(v => `<td>${v.toFixed(1)}</td>`)
              .join('')}</tr>`,
        )
        .join('')}
    </table>`
}

panel.addEventListener('click', e => {
  const name = (e.target as HTMLElement).dataset.bench
  if (name && !running) void benchmarks[name]!().then(render)
})
setInterval(() => {
  if (!running) render()
}, 500)
render()

Object.assign(window as unknown as Record<string, unknown>, {
  chart,
  candles,
  benchmarks,
  results,
  timings,
})

// Helpers ------------------------------------------------------------------

/** A seeded log-normal random walk of `count` 1m bars starting at `startTime`. */
function generateBars(
  count: number,
  startTime: number,
  startPrice: number,
  seed: number,
): Bar[] {
  const rand = mulberry32(seed)
  const out: Bar[] = new Array(count)
  let price = startPrice
  for (let i = 0; i < count; i++) {
    const open = price
    const close = open * Math.exp((rand() - 0.5) * 0.004)
    const high = Math.max(open, close) * (1 + rand() * 0.0015)
    const low = Math.min(open, close) * (1 - rand() * 0.0015)
    const volume = 200 + rand() * 1800
    out[i] = { time: startTime + i * INTERVAL, open, high, low, close, volume }
    price = close
  }
  return out
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function avg(xs: readonly number[]): number {
  return xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length
}

function pct(xs: readonly number[], p: number): number {
  if (xs.length === 0) return 0
  const sorted = xs.slice().sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))]!
}

function stats(xs: readonly number[]): string {
  if (xs.length === 0) return '—'
  return `${avg(xs).toFixed(2)} / ${pct(xs, 0.95).toFixed(2)} / ${Math.max(...xs).toFixed(2)}`
}

function fmtCount(n: number): string {
  return n >= 1000 ? `${Math.round(n / 1000)}k` : String(n)
}

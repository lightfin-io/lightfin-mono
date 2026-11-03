import { createChart } from 'lightfin-web-chart'

import { createMockFeed } from './mockFeed.ts'

import './style.css'

const container = document.querySelector<HTMLDivElement>('#chart')!

const chart = createChart(container, { volumeVisible: true })
const candles = chart.addCandlestickSeries()

// Seed with recent history, then attach the live/backfill data source (PLAN §6).
const feed = createMockFeed({
  intervalSec: 60,
  initialCount: 200,
  tickMs: 1000,
})
candles.setData(feed.initial())
const detach = chart.setDataSource(feed.source)

// Indicators load on demand from their own chunks (PLAN §8.4/§10) — the core
// bundle never includes them until used here.
const sma = await chart.addIndicator(
  import('lightfin-web-chart/indicators/sma'),
  { period: 20, color: '#2962ff' },
)
const ema = await chart.addIndicator(
  import('lightfin-web-chart/indicators/ema'),
  { period: 50, color: '#ff6d00' },
)
const bb = await chart.addIndicator(
  import('lightfin-web-chart/indicators/bollinger'),
  { period: 20, mult: 2 },
)
// Pane indicators get their own sub-panes with independent scales.
const rsi = await chart.addIndicator(
  import('lightfin-web-chart/indicators/rsi'),
)
const macd = await chart.addIndicator(
  import('lightfin-web-chart/indicators/macd'),
)

// Expose for manual poking in the console.
Object.assign(window as unknown as Record<string, unknown>, {
  chart,
  candles,
  detach,
  sma,
  ema,
  bb,
  rsi,
  macd,
})

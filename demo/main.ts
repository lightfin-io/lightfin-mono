import { createChart } from 'lightfin-web-chart'

import { createMockFeed } from './mockFeed.ts'

import './style.css'

const container = document.querySelector<HTMLDivElement>('#chart')!

const chart = createChart(container, { volumeVisible: true })
const candles = chart.addCandlestickSeries()

// Seed with recent history, then attach the live/backfill data source (PLAN §6).
const feed = createMockFeed({ intervalSec: 60, initialCount: 200, tickMs: 1000 })
candles.setData(feed.initial())
const detach = chart.setDataSource(feed.source)

// Expose for manual poking in the console.
Object.assign(window as unknown as Record<string, unknown>, {
  chart,
  candles,
  detach,
})

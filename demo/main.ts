import { createChart } from 'lightfin-web-chart'
import { createChrome } from 'lightfin-web-chart/chrome'

import { createMockFeed } from './mockFeed.ts'

import './style.css'

const container = document.querySelector<HTMLDivElement>('#chart')!

const chart = createChart(container, { volumeVisible: true })
chart.setInstrument({
  symbol: 'MOCKUSD',
  name: 'Mock Coin / US Dollar',
  exchange: 'DEMO',
  timezone: 'America/New_York',
  pricePrecision: 2,
})
const candles = chart.addCandlestickSeries()

// The chart has no notion of interval: the chrome's selector asks us to load
// the matching bars, here by swapping in a mock feed at that bar period.
const INTERVALS: Record<string, number> = {
  '1m': 60,
  '5m': 300,
  '15m': 900,
  '1H': 3600,
  '4H': 14_400,
  '1D': 86_400,
}
let detach = () => {}
function loadInterval(interval: string): void {
  detach()
  const feed = createMockFeed({
    intervalSec: INTERVALS[interval]!,
    initialCount: 200,
    tickMs: 1000,
  })
  candles.setData(feed.initial())
  detach = chart.setDataSource(feed.source)
}
loadInterval('1m')

const chrome = createChrome(chart, {
  intervals: Object.keys(INTERVALS),
  interval: '1m',
  onIntervalChange: loadInterval,
})

// Indicators load on demand from their own chunks (PLAN §8.4/§10) — the core
// bundle never includes them until used here. More can be added from the
// toolbar's indicators menu.
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
// Draws over the volume histogram on its hidden scale.
const volumeMa = await chart.addIndicator(
  import('lightfin-web-chart/indicators/volumeMa'),
)

// Expose for manual poking in the console.
Object.assign(window as unknown as Record<string, unknown>, {
  chart,
  chrome,
  candles,
  sma,
  ema,
  bb,
  rsi,
  macd,
  volumeMa,
})

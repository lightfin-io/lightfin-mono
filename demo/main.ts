import { createChart } from 'lightfin-web-chart'
import { createAnnotations } from 'lightfin-web-chart/annotations'
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

// Drawings are plain JSON (PLAN §8.5); persisting them is the host's job, here
// localStorage. They anchor to time + price, so they survive interval switches.
const DRAWINGS_KEY = 'lightfin-demo-drawings'
const drawings = createAnnotations(chart)
try {
  drawings.load(JSON.parse(localStorage.getItem(DRAWINGS_KEY) ?? '[]'))
} catch {
  localStorage.removeItem(DRAWINGS_KEY)
}
drawings.on('change', () => {
  localStorage.setItem(DRAWINGS_KEY, JSON.stringify(drawings.toJSON()))
})

const chrome = createChrome(chart, {
  intervals: Object.keys(INTERVALS),
  interval: '1m',
  onIntervalChange: loadInterval,
  annotations: drawings,
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

// The chart only draws the "+" button on the crosshair line; the order form is
// ours to render (PLAN §8.2). This stand-in just shows the clicked price.
const orderPopup = document.createElement('div')
orderPopup.className = 'order-popup'
orderPopup.hidden = true
document.body.append(orderPopup)
chart.onOrderIntent(e => {
  orderPopup.textContent = `Limit order @ ${chart.formatPrice(e.price)}`
  orderPopup.style.left = `${e.clientPoint.x - 8}px`
  orderPopup.style.top = `${e.clientPoint.y + 14}px`
  orderPopup.style.transform = 'translateX(-100%)'
  orderPopup.hidden = false
})
document.addEventListener('pointerdown', e => {
  if (e.target !== orderPopup) orderPopup.hidden = true
})

// "M" toggles the magnet crosshair (snaps to the hovered bar's OHLC).
document.addEventListener('keydown', e => {
  if (e.key !== 'm' || e.target instanceof HTMLInputElement) return
  chart.setCrosshairMode(
    chart.crosshairMode() === 'magnet' ? 'normal' : 'magnet',
  )
})

// Expose for manual poking in the console.
Object.assign(window as unknown as Record<string, unknown>, {
  chart,
  chrome,
  drawings,
  candles,
  sma,
  ema,
  bb,
  rsi,
  macd,
  volumeMa,
})

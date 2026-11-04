import { createChart } from 'lightfin-web-chart'
import { createAnnotations } from 'lightfin-web-chart/annotations'
import { createChrome } from 'lightfin-web-chart/chrome'
import { addPriceLine } from 'lightfin-web-chart/price-lines'
import type { PriceLine } from 'lightfin-web-chart/price-lines'

import { createBinanceFeed } from './binanceFeed.ts'
import { createMockFeed } from './mockFeed.ts'

import './style.css'

// Live BTC/USDT from Binance by default. `?feed=mock` swaps in a
// deterministic offline feed, and `?live=0` keeps history paging but drops
// live ticks so the chart holds still (the e2e tests use both).
const params = new URLSearchParams(location.search)
const mock = params.get('feed') === 'mock'
const live = params.get('live') !== '0'

const container = document.querySelector<HTMLDivElement>('#chart')!

const chart = createChart(container, { volumeVisible: true })
chart.setInstrument(
  mock
    ? {
        symbol: 'MOCKUSD',
        name: 'Mock Coin / US Dollar',
        exchange: 'DEMO',
        timezone: 'America/New_York',
        pricePrecision: 2,
      }
    : {
        symbol: 'BTCUSDT',
        name: 'Bitcoin / TetherUS',
        exchange: 'BINANCE',
        timezone: 'UTC',
        pricePrecision: 2,
      },
)
const candles = chart.addCandlestickSeries()

// The chart has no notion of interval: the chrome's selector asks us to load
// the matching bars, by attaching a data source at that bar period. The chart
// cancels the previous source's requests and loads the new one.
const INTERVALS: Record<string, number> = {
  '1m': 60,
  '5m': 300,
  '15m': 900,
  '1H': 3600,
  '4H': 14_400,
  '1D': 86_400,
}
function loadInterval(interval: string): void {
  const source = mock
    ? createMockFeed({ intervalSec: INTERVALS[interval]!, tickMs: 1000 })
    : // Binance spells these intervals in lowercase: 1m … 1h, 4h, 1d.
      createBinanceFeed({
        symbol: 'BTCUSDT',
        interval: interval.toLowerCase(),
      })
  chart.setDataSource(live ? source : { getBars: source.getBars })
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
// ours to render (PLAN §8.2). This stand-in places a draggable limit-order
// line, the way a trading UI would show a working order.
const orderPopup = document.createElement('div')
orderPopup.className = 'order-popup'
orderPopup.hidden = true
const orderLabel = document.createElement('span')
const placeButton = document.createElement('button')
placeButton.textContent = 'Place'
orderPopup.append(orderLabel, placeButton)
document.body.append(orderPopup)
let orderPrice = 0
const orders: PriceLine[] = []
chart.onOrderIntent(e => {
  orderPrice = e.price
  orderLabel.textContent = `Limit @ ${chart.formatPrice(e.price)}`
  orderPopup.style.left = `${e.clientPoint.x - 8}px`
  orderPopup.style.top = `${e.clientPoint.y + 14}px`
  orderPopup.style.transform = 'translateX(-100%)'
  orderPopup.hidden = false
})
placeButton.addEventListener('click', () => {
  orderPopup.hidden = true
  const order = addPriceLine(chart, {
    price: orderPrice,
    title: 'Limit 1.0',
    color: '#f7a600',
    draggable: true,
  })
  // Snap to whole cents while dragging, as an exchange's tick size would.
  order.on('drag', price =>
    order.setOptions({ price: Math.round(price * 100) / 100 }),
  )
  orders.push(order)
})
document.addEventListener('pointerdown', e => {
  if (!orderPopup.contains(e.target as Node)) orderPopup.hidden = true
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
  orders,
  candles,
  sma,
  ema,
  bb,
  rsi,
  macd,
  volumeMa,
})

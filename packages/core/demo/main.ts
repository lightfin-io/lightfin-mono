import { createChart } from '@lightfin/core'
import { createAnnotations } from '@lightfin/core/annotations'
import type { AnnotationInput } from '@lightfin/core/annotations'
import { createChrome } from '@lightfin/core/chrome'
import { addEventTags } from '@lightfin/core/event-tags'
import type { ChartEvent } from '@lightfin/core/event-tags'
import { addPriceLine } from '@lightfin/core/price-lines'
import type { PriceLine } from '@lightfin/core/price-lines'

import { createBinanceFeed } from './binanceFeed.ts'
import { mockAnalyst } from './mockAnalyst.ts'
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
const sma = await chart.addIndicator(import('@lightfin/core/indicators/sma'), {
  period: 20,
  color: '#2962ff',
})
const ema = await chart.addIndicator(import('@lightfin/core/indicators/ema'), {
  period: 50,
  color: '#ff6d00',
})
const bb = await chart.addIndicator(
  import('@lightfin/core/indicators/bollinger'),
  { period: 20, mult: 2 },
)
// Pane indicators get their own sub-panes with independent scales.
const rsi = await chart.addIndicator(import('@lightfin/core/indicators/rsi'))
const macd = await chart.addIndicator(import('@lightfin/core/indicators/macd'))
// Draws over the volume histogram on its hidden scale.
const volumeMa = await chart.addIndicator(
  import('@lightfin/core/indicators/volumeMa'),
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

// Event tags (PLAN §8.9): E/D markers along the bottom of the price pane. The
// library draws the tags and reports a click; the detail card is ours, the way
// TradingView opens an earnings card above the tag. Real hosts feed these from
// an earnings/dividends calendar; here we scatter a few across the first screen.
const eventPopup = document.createElement('div')
eventPopup.className = 'event-popup'
eventPopup.hidden = true
document.body.append(eventPopup)
const closeEventPopup = () => {
  eventPopup.hidden = true
}
const tags = addEventTags(chart, {
  events: [],
  onSelect: (event, pos) => {
    eventPopup.innerHTML = ''
    const h = document.createElement('strong')
    h.textContent = event.title ?? event.type ?? 'Event'
    const p = document.createElement('span')
    p.textContent = event.body ?? ''
    eventPopup.append(h, p)
    eventPopup.style.left = `${pos.clientPoint.x}px`
    eventPopup.style.top = `${pos.clientPoint.y - 10}px`
    eventPopup.hidden = false
  },
})
document.addEventListener('pointerdown', e => {
  if (!eventPopup.contains(e.target as Node)) closeEventPopup()
})
// Seed the tags once there's data to anchor them to, then leave them put.
// The initial load may land during this module's top-level awaits above, so
// seed immediately if it already has, otherwise on the first data change.
let seeded = false
const seedEvents = () => {
  if (seeded) return
  const range = chart.visibleTimeRange()
  if (!range) return
  seeded = true
  off()
  const at = (frac: number) =>
    (range.from +
      Math.round((range.to - range.from) * frac)) as typeof range.from
  const events: ChartEvent[] = [
    {
      time: at(0.3),
      type: 'earnings',
      title: 'Q3 earnings',
      body: 'EPS 1.24 vs 1.10 est. · Revenue 8.6B',
    },
    {
      time: at(0.55),
      type: 'dividend',
      title: 'Dividend',
      body: '$0.24 / share · ex-date',
    },
    {
      time: at(0.8),
      type: 'earnings',
      title: 'Guidance update',
      body: 'Raised FY outlook',
    },
  ]
  ;(window as unknown as Record<string, unknown>).chartEvents = events
  tags.setEvents(events)
}
const off = chart.on('dataChange', seedEvents)
seedEvents()

// AI annotations (PLAN §8.7): a model reads the bars on screen and answers
// with the `annotate_chart` tool; its drawings form the 'ai' group, which
// each answer replaces without touching the user's drawings. The mock
// analyst stands in for the model.
function applyToolCall(input: { annotations: AnnotationInput[] }): string {
  try {
    drawings.replace('ai', input.annotations)
    return 'ok'
  } catch (e) {
    // A real host returns this to the model as the tool result to retry.
    return (e as Error).message
  }
}
const aiButton = document.createElement('button')
aiButton.className = 'ai-button'
const syncAiButton = () => {
  aiButton.textContent =
    drawings.list('ai').length > 0 ? 'Clear AI drawings' : 'AI annotate'
}
aiButton.addEventListener('click', () => {
  if (drawings.list('ai').length > 0) {
    drawings.clear('ai')
    return
  }
  const range = chart.visibleTimeRange()
  if (range) applyToolCall(mockAnalyst(candles.bars(range)))
})
drawings.on('change', syncAiButton)
syncAiButton()
document.body.append(aiButton)

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

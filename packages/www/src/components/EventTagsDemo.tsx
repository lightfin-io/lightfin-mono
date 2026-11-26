import type { Bar } from '@lightfin/core'
import type { ChartEvent } from '@lightfin/core/event-tags'

import { EventChart } from './EventChart'
import { useDocsChartTheme } from './useDocsChartTheme'

import './event-tags.css'

// Hourly sample. Each event time is a bar time, so its button lands on a candle.
const START = 1704067200
const HOUR = 3600
const timeAt = (index: number) => START + index * HOUR

const closeAt = (i: number) =>
  100 + i * 0.15 + 3.2 * Math.sin(i / 7) + 1.1 * Math.sin(i * 1.6)

const bars: Bar[] = Array.from({ length: 72 }, (_, i) => {
  const open = closeAt(i - 1)
  const close = closeAt(i)
  return {
    time: timeAt(i),
    open,
    high: Math.max(open, close) + 0.55 + (i % 4) * 0.12,
    low: Math.min(open, close) - 0.45 - (i % 3) * 0.15,
    close,
    volume: 1200 + ((i * 47) % 900) + (close >= open ? 500 : 180),
  }
})

const events: ChartEvent[] = [
  {
    time: timeAt(22),
    symbol: 'E',
    title: 'Q3 earnings',
    body: 'EPS 1.24 vs 1.10 est.',
  },
  {
    time: timeAt(40),
    symbol: 'D',
    symbolColor: '#26a69a',
    title: 'Dividend',
    body: '$0.24 / share · ex-date',
  },
  {
    time: timeAt(56),
    symbol: 'E',
    title: 'Guidance update',
    body: 'Raised FY outlook',
  },
]

export default function EventTagsDemo() {
  const theme = useDocsChartTheme()
  return (
    <div className="event-demo not-content">
      <EventChart
        key={theme.colorScheme}
        bars={bars}
        events={events}
        theme={theme}
      />
    </div>
  )
}

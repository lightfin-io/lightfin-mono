import { LightfinChart, useChartEffect } from '@lightfin/react'
import { createAnnotations } from '@lightfin/core/annotations'
import { createChrome } from '@lightfin/core/chrome'
import type { CSSProperties } from 'react'

import { createBinanceFeed } from './binanceFeed'

// The chart has no notion of interval: the chrome's selector asks us to load
// the matching bars. Binance spells these lowercase (1m … 1h, 4h, 1d).
const INTERVALS = ['1m', '5m', '15m', '1H', '4H', '1D'] as const
const DEFAULT_INTERVAL = '1H'

/**
 * The hero demo: a real `@lightfin/core` chart driven through `@lightfin/react`,
 * streaming live BTC/USDT bars from Binance's public market-data feed — the
 * same source the core demo uses. The chrome supplies the interval selector,
 * chart-type switcher, indicators menu, HUD legend and bottom toolbar.
 */
export default function LiveChart({ height = 420 }: LiveChartProps) {
  return (
    <LightfinChart
      className="live-chart"
      style={{ height, width: '100%' } satisfies CSSProperties}
      options={{ volumeVisible: true }}
    >
      <Candles />
    </LightfinChart>
  )
}

export interface LiveChartProps {
  height?: number
}

function Candles() {
  // Create the series, attach the live Binance feed, and mount the chrome once.
  useChartEffect(chart => {
    chart.setInstrument({
      symbol: 'BTCUSDT',
      name: 'Bitcoin / TetherUS',
      exchange: 'BINANCE',
      timezone: 'UTC',
      pricePrecision: 2,
    })
    chart.addCandlestickSeries()

    const loadInterval = (interval: string) => {
      chart.setDataSource(
        createBinanceFeed({ symbol: 'BTCUSDT', interval: interval.toLowerCase() }),
      )
    }
    loadInterval(DEFAULT_INTERVAL)

    // Drawings anchor to time + price, so they survive interval switches.
    const drawings = createAnnotations(chart)

    const chrome = createChrome(chart, {
      intervals: INTERVALS,
      interval: DEFAULT_INTERVAL,
      onIntervalChange: loadInterval,
      annotations: drawings,
    })

    return () => {
      chrome.dispose()
      drawings.dispose()
    }
  }, [])

  return null
}

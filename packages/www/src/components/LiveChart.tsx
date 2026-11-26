import { createAnnotations } from '@lightfin/core/annotations'
import { createChrome } from '@lightfin/core/chrome'
import { LightfinChart, useChartEffect } from '@lightfin/react'
import type { CSSProperties } from 'react'

import { createBinanceFeed } from './binanceFeed'
import { useDocsChartTheme } from './useDocsChartTheme'

const INTERVALS = ['1m', '5m', '15m', '1H', '4H', '1D'] as const
const DEFAULT_INTERVAL = '1H'

/**
 * The hero demo: a real `@lightfin/core` chart driven through `@lightfin/react`,
 * streaming live BTC/USDT bars from Binance's public market-data feed — the
 * same source the core demo uses. The chrome supplies the interval selector,
 * chart-type switcher, indicators menu, HUD legend and bottom toolbar.
 */
export default function LiveChart({ height = 420 }: LiveChartProps) {
  const theme = useDocsChartTheme()
  return (
    // The engine reads `options` only once, so re-key on the docs theme to
    // recreate the chart with the matching palette when the toggle is flipped.
    <LightfinChart
      key={theme.colorScheme}
      className="live-chart"
      style={{ height, width: '100%' } satisfies CSSProperties}
      options={{ volumeVisible: true, theme }}
    >
      <DemoChart />
    </LightfinChart>
  )
}

export interface LiveChartProps {
  height?: number
}

function DemoChart() {
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
        createBinanceFeed({
          symbol: 'BTCUSDT',
          interval: interval.toLowerCase(),
        }),
      )
    }
    const drawings = createAnnotations(chart, {
      persistenceKey: 'lightfin-www:drawings:BTCUSDT',
    })
    const chrome = createChrome(chart, {
      intervals: INTERVALS,
      interval: DEFAULT_INTERVAL,
      onIntervalChange: loadInterval,
      persistenceKey: 'lightfin:homepage-demo:preferences',
      annotations: drawings,
    })
    // A restored interval already goes through onIntervalChange.
    if (chrome.interval() === DEFAULT_INTERVAL) loadInterval(DEFAULT_INTERVAL)

    return () => {
      chrome.dispose()
      drawings.dispose()
    }
  }, [])

  return null
}

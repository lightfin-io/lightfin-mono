import { LightfinChart, useChartEffect } from '@lightfin/react'
import { DEFAULT_THEME } from '@lightfin/core'
import type { ChartTheme } from '@lightfin/core'
import { createAnnotations } from '@lightfin/core/annotations'
import { createChrome } from '@lightfin/core/chrome'
import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'

import { createBinanceFeed } from './binanceFeed'

// A light counterpart to core's dark `DEFAULT_THEME`, tuned to sit on the docs'
// white reading column. Candle/volume/indicator hues are shared with the dark
// theme. The light theme sets the chart neutrals and chrome colors explicitly.
const LIGHT_CHART_THEME: Partial<ChartTheme> = {
  background: '#ffffff',
  gridColor: '#e7ebee',
  axisTextColor: '#5c6b74',
  axisBorderColor: '#d7dde1',
  crosshairColor: '#9aa4ad',
  textStrong: '#131722',
  hover: 'rgba(92, 107, 116, 0.16)',
  hudHover: 'rgba(255, 255, 255, 0.7)',
  panel: '#ebebeb',
  colorScheme: 'light',
}

type DocsTheme = 'light' | 'dark'

/**
 * Tracks Starlight's current theme. Starlight stores the resolved choice as a
 * `data-theme` attribute on `<html>` and flips it in place when the toggle is
 * used, so we read it once and then watch that attribute for changes.
 */
function useDocsTheme(): DocsTheme {
  const [theme, setTheme] = useState<DocsTheme>(() =>
    typeof document !== 'undefined' &&
    document.documentElement.dataset.theme === 'light'
      ? 'light'
      : 'dark',
  )
  useEffect(() => {
    const root = document.documentElement
    const read = () =>
      setTheme(root.dataset.theme === 'light' ? 'light' : 'dark')
    read()
    const observer = new MutationObserver(read)
    observer.observe(root, {
      attributes: true,
      attributeFilter: ['data-theme'],
    })
    return () => observer.disconnect()
  }, [])
  return theme
}

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
  const docsTheme = useDocsTheme()
  const theme =
    docsTheme === 'light'
      ? { ...DEFAULT_THEME, ...LIGHT_CHART_THEME }
      : DEFAULT_THEME
  return (
    // The engine reads `options` only once, so re-key on the docs theme to
    // recreate the chart with the matching palette when the toggle is flipped.
    <LightfinChart
      key={docsTheme}
      className="live-chart"
      style={{ height, width: '100%' } satisfies CSSProperties}
      options={{ volumeVisible: true, theme }}
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

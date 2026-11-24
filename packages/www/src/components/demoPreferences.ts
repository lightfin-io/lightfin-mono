import { DEFAULT_OPTIONS } from '@lightfin/core'
import type { ChartType, CrosshairMode } from '@lightfin/core'

// Chrome displays uppercase hour/day labels. Binance expects lowercase.
export const INTERVALS = ['1m', '5m', '15m', '1H', '4H', '1D'] as const
const CHART_TYPES: readonly ChartType[] = ['candlestick', 'bar', 'line', 'area']
const STORAGE_KEY = 'lightfin:homepage-demo:preferences'

interface DemoPreferences {
  interval: string
  chartType: ChartType
  crosshairMode: CrosshairMode
}

export function loadDemoPreferences(): DemoPreferences {
  let saved: Partial<DemoPreferences> | null = null
  try {
    saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')
  } catch {
    // Storage may be unavailable or contain invalid JSON.
  }

  const crosshairMode = saved?.crosshairMode
  return {
    interval: INTERVALS.find(interval => interval === saved?.interval) ?? '1H',
    chartType:
      CHART_TYPES.find(type => type === saved?.chartType) ?? 'candlestick',
    crosshairMode:
      crosshairMode === 'normal' || crosshairMode === 'magnet'
        ? crosshairMode
        : DEFAULT_OPTIONS.crosshairMode,
  }
}

export function saveDemoPreferences(preferences: DemoPreferences): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences))
  } catch {
    // The demo still works when the browser blocks storage.
  }
}

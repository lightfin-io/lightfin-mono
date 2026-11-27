import { DEFAULT_THEME } from '@lightfin/core'
import type { ChartTheme } from '@lightfin/core'
import { useEffect, useState } from 'react'

// Keep candle, volume, and indicator hues shared between both modes.
const LIGHT_CHART_THEME: ChartTheme = {
  ...DEFAULT_THEME,
  background: '#ffffff',
  gridColor: '#e7ebee',
  axisTextColor: '#5c6b74',
  axisBorderColor: '#d7dde1',
  crosshairColor: '#9aa4ad',
  strongTextColor: '#131722',
  buttonHoverBg: 'rgba(92, 107, 116, 0.16)',
  hudHoverBg: 'rgba(255, 255, 255, 0.7)',
  panelBg: '#ebebeb',
  panelTextColor: '#131722',
  panelMutedTextColor: '#5c6b74',
  panelBorderColor: '#d7d7d7',
  panelHoverBg: 'rgba(92, 107, 116, 0.16)',
  panelInputBg: '#ffffff',
  scrollbarThumbColor: '#8f8f8f',
  scrollbarTrackColor: '#dedede',
  colorScheme: 'light',
}

/** Follow Starlight's resolved theme, including changes from the picker. */
export function useDocsChartTheme(): ChartTheme {
  const [light, setLight] = useState(
    () =>
      typeof document !== 'undefined' &&
      document.documentElement.dataset.theme === 'light',
  )
  useEffect(() => {
    const root = document.documentElement
    const read = () => setLight(root.dataset.theme === 'light')
    read()
    const observer = new MutationObserver(read)
    observer.observe(root, {
      attributes: true,
      attributeFilter: ['data-theme'],
    })
    return () => observer.disconnect()
  }, [])
  return light ? LIGHT_CHART_THEME : DEFAULT_THEME
}

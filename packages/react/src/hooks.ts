import type { Chart } from '@lightfin/core'
import { useEffect } from 'react'
import type { DependencyList } from 'react'

import { useChart } from './context'

/**
 * Run an effect against the chart once it exists, re-running when `deps`
 * change and cleaning up on unmount. The escape hatch for wiring anything
 * imperative onto the chart — series, data, indicators, `createChrome`,
 * `createAnnotations`, `addPriceLine` — without a component per feature:
 *
 * ```tsx
 * function Candles({ bars }: { bars: Bar[] }) {
 *   useChartEffect(chart => {
 *     const series = chart.addCandlestickSeries()
 *     series.setData(bars)
 *   }, [bars])
 *   return null
 * }
 * ```
 *
 * The callback receives a non-null {@link Chart}; the effect simply does not
 * run while the chart is still being created.
 */
export function useChartEffect(
  effect: (chart: Chart) => void | (() => void),
  deps: DependencyList = [],
): void {
  const chart = useChart()
  useEffect(() => {
    if (!chart) return
    return effect(chart)
    // The caller owns `deps`; `chart` is the only implicit dependency.
  }, [chart, ...deps])
}

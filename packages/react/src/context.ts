import type { Chart } from 'lightfin-web-chart'
import { createContext, useContext } from 'react'

/**
 * Carries the chart instance down to feature components (via
 * {@link useChart} / {@link useChartEffect}).
 *
 * `undefined` means "no `<LightfinChart>` above me"; `null` means the provider
 * is present but the chart has not been created yet (it is built in a layout
 * effect, one render after mount).
 */
export const ChartContext = createContext<Chart | null | undefined>(undefined)

/**
 * The chart instance from the nearest {@link LightfinChart}, or `null` until it
 * exists (the frame after mount). Throws if called outside a `<LightfinChart>`.
 *
 * Prefer {@link useChartEffect} for wiring series, indicators, chrome, or
 * annotations — it waits for the instance and cleans up for you.
 */
export function useChart(): Chart | null {
  const chart = useContext(ChartContext)
  if (chart === undefined) {
    throw new Error('lightfin: useChart must be used inside <LightfinChart>')
  }
  return chart
}

/**
 * lightfin-web-chart — core entry point.
 *
 * Re-exports the minimal "core" surface only (PLAN §10): the chart engine plus
 * the series/axes/interaction it ships with. Indicators and annotations live
 * behind their own subpath exports so consumers only pay for what they import.
 */
export { createChart } from './api/createChart.ts'
export { Chart } from './chart/chart.ts'
export type { PlotRect } from './chart/chart.ts'
export type {
  ChartOptions,
  ChartOptionsInput,
  ChartTheme,
} from './chart/options.ts'
export { DEFAULT_OPTIONS, DEFAULT_THEME } from './chart/options.ts'
export type { Bar, UTCTimestamp } from './data/types.ts'

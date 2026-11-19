/**
 * @lightfin/core — core entry point.
 *
 * Re-exports the minimal "core" surface only: the chart engine plus
 * the series/axes/interaction it ships with. Indicators and annotations live
 * behind their own subpath exports so consumers only pay for what they import.
 */
export { createChart } from './api/createChart'
export { Chart } from './chart/chart'
export type {
  ChartEventMap,
  CrosshairMoveEvent,
  PaneLayout,
  PlotRect,
} from './chart/chart'
export type {
  ChartOptions,
  ChartOptionsInput,
  ChartTheme,
  CrosshairMode,
  DateFormatters,
} from './chart/options'
export type {
  ChartPointerEvent,
  ChartPrimitive,
  PrimitiveHandle,
  PrimitiveView,
} from './chart/primitive'
export type { OrderIntentEvent } from './interaction/orderIntent'
export {
  DEFAULT_DATE_FORMATTERS,
  DEFAULT_OPTIONS,
  DEFAULT_THEME,
} from './chart/options'
export type { Bar, InstrumentInfo, UTCTimestamp } from './data/types'
export type {
  IndicatorHandle,
  IndicatorPlacement,
  PlotStyle,
} from './indicators/types'
export type { BarsRequest, DataSource } from './data/dataSource'
export { Series } from './series/series'
export type { ChartType, SeriesChange } from './series/series'
export type { PushResult } from './data/store'

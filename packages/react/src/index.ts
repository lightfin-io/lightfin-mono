/**
 * @lightfin/react — a thin React wrapper (PLAN §8.8).
 *
 * `<LightfinChart>` owns the chart's lifecycle; `useChartEffect` wires features
 * (series, indicators, chrome, annotations, price lines) imperatively onto it.
 * `@lightfin/core` and `react` are both peer dependencies.
 *
 * ```tsx
 * import { LightfinChart, useChartEffect } from '@lightfin/react'
 *
 * function Candles({ bars }: { bars: Bar[] }) {
 *   useChartEffect(chart => {
 *     chart.addCandlestickSeries().setData(bars)
 *   }, [bars])
 *   return null
 * }
 *
 * function App() {
 *   return (
 *     <LightfinChart style={{ height: 420 }}>
 *       <Candles bars={bars} />
 *     </LightfinChart>
 *   )
 * }
 * ```
 */
export { LightfinChart } from './LightfinChart'
export type { LightfinChartProps } from './LightfinChart'
export { ChartContext, useChart } from './context'
export { useChartEffect } from './hooks'

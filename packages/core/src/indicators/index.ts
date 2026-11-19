/**
 * @lightfin/core/indicators — the indicator contract surface.
 *
 * This barrel exports only *types* (erased at build), so importing it pulls in
 * no runtime code. Each concrete indicator is its own subpath module, loaded on
 * demand so the core never carries the catalog:
 *
 * ```ts
 * const sma = await chart.addIndicator(
 *   import('@lightfin/core/indicators/sma'),
 *   { period: 20 },
 * )
 * ```
 */
export type {
  BarReader,
  IndicatorCalc,
  IndicatorDefinition,
  IndicatorHandle,
  IndicatorModule,
  IndicatorPlacement,
  PlotStyle,
} from './types'

import { Chart } from '../chart/chart.ts'
import type { ChartOptionsInput } from '../chart/options.ts'

/**
 * Create a chart bound to `container`. Synchronous by design — Canvas2D needs
 * no async device init (PLAN §5). The chart observes `container` and always
 * fills it; there is no width/height option.
 */
export function createChart(
  container: HTMLElement,
  options: ChartOptionsInput = {},
): Chart {
  return new Chart(container, options)
}

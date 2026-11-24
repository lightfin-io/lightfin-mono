/**
 * @lightfin/core/annotations — opt-in drawing tools: lines,
 * channels, Fibonacci, Gann, patterns, shapes, labels, and measurements.
 *
 * Its own subpath export, so the core bundle never includes annotation code
 * unless a consumer imports it. Drawings serialize to plain JSON for the host
 * to persist:
 *
 * ```ts
 * import { createAnnotations } from '@lightfin/core/annotations'
 * const drawings = createAnnotations(chart)
 * drawings.load(JSON.parse(localStorage.drawings ?? '[]'))
 * drawings.on('change', () => {
 *   localStorage.drawings = JSON.stringify(drawings.toJSON())
 * })
 * drawings.setTool('trendline') // or pass `drawings` to createChrome()
 * ```
 *
 * A program — say an AI — annotates through the same JSON, as a group it
 * replaces wholesale; `@lightfin/core/annotations/schema` describes the
 * JSON for a model:
 *
 * ```ts
 * drawings.replace('ai', [
 *   { type: 'hline', points: [{ time, price: 64_200 }], text: 'Support' },
 *   { type: 'marker', shape: 'arrowUp', points: [{ time, price: low }] },
 * ])
 * ```
 */
import type { Chart } from '../chart/chart'
import { Annotations } from './annotations'

export { Annotations } from './annotations'
export type { AnnotationPatch, AnnotationsEventMap } from './annotations'
export { FIB_EXTENSION_LEVELS, FIB_LEVELS } from './tools'
export { validateAnnotation } from './validate'
export type {
  Annotation,
  AnnotationInput,
  AnnotationPoint,
  AnnotationStyle,
  AnnotationType,
  LineEnds,
  LineStyle,
  MarkerShape,
  ToolPreset,
} from './types'

/** Attach drawing tools to `chart`. */
export function createAnnotations(chart: Chart): Annotations {
  return new Annotations(chart)
}

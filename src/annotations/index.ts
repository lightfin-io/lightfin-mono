/**
 * lightfin-web-chart/annotations — opt-in drawing tools (PLAN §8.5).
 *
 * Its own subpath export, so the core bundle never includes annotation code
 * unless a consumer imports it. Drawings serialize to plain JSON for the host
 * to persist:
 *
 * ```ts
 * import { createAnnotations } from 'lightfin-web-chart/annotations'
 * const drawings = createAnnotations(chart)
 * drawings.load(JSON.parse(localStorage.drawings ?? '[]'))
 * drawings.on('change', () => {
 *   localStorage.drawings = JSON.stringify(drawings.toJSON())
 * })
 * drawings.setTool('trendline') // or pass `drawings` to createChrome()
 * ```
 *
 * A program — say an AI — annotates through the same JSON, as a group it
 * replaces wholesale; `lightfin-web-chart/annotations/schema` describes the
 * JSON for a model (PLAN §8.7):
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
export type { AnnotationsEventMap } from './annotations'
export { FIB_LEVELS } from './tools'
export { validateAnnotation } from './validate'
export type {
  Annotation,
  AnnotationInput,
  AnnotationPoint,
  AnnotationStyle,
  AnnotationType,
  LineStyle,
  MarkerShape,
} from './types'

/** Attach drawing tools to `chart`. */
export function createAnnotations(chart: Chart): Annotations {
  return new Annotations(chart)
}

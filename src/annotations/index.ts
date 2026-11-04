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
 */
import type { Chart } from '../chart/chart'
import { Annotations } from './annotations'

export { Annotations } from './annotations'
export type { AnnotationsEventMap } from './annotations'
export { FIB_LEVELS } from './tools'
export type {
  Annotation,
  AnnotationInput,
  AnnotationPoint,
  AnnotationStyle,
  AnnotationType,
  LineStyle,
} from './types'

/** Attach drawing tools to `chart`. */
export function createAnnotations(chart: Chart): Annotations {
  return new Annotations(chart)
}

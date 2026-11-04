import type { UTCTimestamp } from '../data/types'

/**
 * The drawing tools (PLAN §8.5):
 *   - `trendline` — a segment between two points.
 *   - `hline` / `vline` — a horizontal line at a price / vertical line at a time.
 *   - `rectangle` — a filled box between two corners.
 *   - `fib` — Fibonacci retracement levels between two points.
 *   - `text` — a single-line label.
 *   - `marker` — an arrow or dot at one bar, e.g. a signal.
 */
export type AnnotationType =
  'trendline' | 'hline' | 'vline' | 'rectangle' | 'fib' | 'text' | 'marker'

/**
 * A marker's shape. `arrowUp` sits below its point pointing up at it,
 * `arrowDown` above pointing down, `circle` on it.
 */
export type MarkerShape = 'arrowUp' | 'arrowDown' | 'circle'

/**
 * An anchor in data space, so drawings stay put across pan/zoom, history
 * backfill, and interval switches.
 */
export interface AnnotationPoint {
  time: UTCTimestamp
  price: number
}

export type LineStyle = 'solid' | 'dashed' | 'dotted'

export interface AnnotationStyle {
  /**
   * Line/text color. Default: the theme's line color (text: axis text color;
   * arrows: the theme's up/down color).
   */
  color?: string
  /** Default 2 for lines, 1 for rectangles and fib levels. */
  lineWidth?: number
  lineStyle?: LineStyle
  /** Rectangle fill. Default: the line color, translucent. */
  fillColor?: string
  /** Text size in px. Default 14 for `text`, the theme's font size for captions. */
  fontSize?: number
}

/**
 * One drawing, as plain JSON for the host to persist (PLAN §8.5). Two points
 * for trendline/rectangle/fib, one for the rest.
 */
export interface Annotation {
  id: string
  type: AnnotationType
  points: AnnotationPoint[]
  style: AnnotationStyle
  /** A `text` annotation's label; on any other type, a caption beside it. */
  text?: string
  /** A `marker`'s shape. Default `circle`. */
  shape?: MarkerShape
  /**
   * Who placed the drawing, e.g. `'ai'`, so the host can replace or clear one
   * source's drawings without touching the rest. The user's have none.
   */
  group?: string
}

/** What `add()`/`load()` accept: an annotation whose id and style are optional. */
export type AnnotationInput = Omit<Annotation, 'id' | 'style'> & {
  id?: string
  style?: AnnotationStyle
}

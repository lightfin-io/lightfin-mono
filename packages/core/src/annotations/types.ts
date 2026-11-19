import type { UTCTimestamp } from '../data/types'

/**
 * The drawing tools. Points are placed in order; the count each
 * takes is in brackets.
 *
 * Lines:
 *   - `trendline` [2] — a segment; `style.extend` makes it a ray or a full
 *     line, `style.arrow` adds arrowheads.
 *   - `hline` [1] / `vline` [1] — a horizontal line at a price / vertical
 *     line at a time.
 *   - `hray` [1] — a horizontal line from its point to the right.
 *   - `crossline` [1] — a horizontal and a vertical line through one point.
 *
 * Channels:
 *   - `channel` [3] — a parallel channel: a line through the first two
 *     points and its parallel through the third.
 *   - `pitchfork` [3] — Andrews' pitchfork: a median line from the first
 *     point through the middle of the other two, with parallels through them.
 *   - `regression` [2] — a linear regression of the closes between two
 *     times, with ±2 standard deviation bands (the points' prices are unused).
 *
 * Fibonacci:
 *   - `fib` [2] — retracement levels from the first point to the second.
 *   - `fibExtension` [3] — trend-based extension: the first two points' move
 *     projected from the third.
 *
 * Shapes:
 *   - `rectangle` [2] / `ellipse` [2] — filled, between opposite corners.
 *   - `triangle` [3] — filled, between three corners.
 *   - `brush` [2 or more] — a freehand stroke.
 *
 * Labels:
 *   - `text` [1] — a free-standing label (multi-line).
 *   - `callout` [2] — a label in a box at the second point, with a leader
 *     line to the first.
 *   - `priceLabel` [1] — a bubble showing its point's price.
 *   - `marker` [1] — an arrow, dot, or flag at one bar, e.g. a signal.
 *
 * Measurement:
 *   - `longPosition` / `shortPosition` [3] — a trade's entry (first point,
 *     also the box's left edge), target (second point, also its right edge),
 *     and stop (third point's price), with risk/reward.
 *   - `measure` [2] — the price change, bars, and time between two points.
 */
export type AnnotationType =
  | 'trendline'
  | 'hline'
  | 'vline'
  | 'hray'
  | 'crossline'
  | 'channel'
  | 'pitchfork'
  | 'regression'
  | 'fib'
  | 'fibExtension'
  | 'rectangle'
  | 'ellipse'
  | 'triangle'
  | 'brush'
  | 'text'
  | 'callout'
  | 'priceLabel'
  | 'marker'
  | 'longPosition'
  | 'shortPosition'
  | 'measure'

/**
 * A marker's shape. `arrowUp` sits below its point pointing up at it,
 * `arrowDown` above pointing down, `circle` on it, `flag` on a pole above it.
 */
export type MarkerShape = 'arrowUp' | 'arrowDown' | 'circle' | 'flag'

/**
 * An anchor in data space, so drawings stay put across pan/zoom, history
 * backfill, and interval switches.
 */
export interface AnnotationPoint {
  time: UTCTimestamp
  price: number
}

export type LineStyle = 'solid' | 'dashed' | 'dotted'

/** Which ends of a line: `start` is at its first point, `end` at its second. */
export type LineEnds = 'none' | 'start' | 'end' | 'both'

export interface AnnotationStyle {
  /**
   * Line color (text: the text color; callout and price label: the box).
   * Default: the theme's line color (text: axis text color; arrows: the
   * theme's up/down color).
   */
  color?: string
  /** Default 2 for lines, 1 for shapes, channels, and fib levels. */
  lineWidth?: number
  lineStyle?: LineStyle
  /** Shape fill or text background. Default: the line color, translucent (text: none). */
  fillColor?: string
  /** Text size in px. Default 14 for `text` and `callout`, the theme's font size otherwise. */
  fontSize?: number
  /** CSS font family. Default: the theme's. */
  fontFamily?: string
  bold?: boolean
  italic?: boolean
  /** Caption/label color. Default: the line color (callout and price label: white). */
  textColor?: string
  /** Trend line and channel: run past these ends to the pane's edge. Default none. */
  extend?: LineEnds
  /** Trend line: arrowheads on these ends. Default none. */
  arrow?: LineEnds
}

/**
 * One drawing, as plain JSON for the host to persist. See
 * {@link AnnotationType} for how many points each type takes.
 */
export interface Annotation {
  id: string
  type: AnnotationType
  points: AnnotationPoint[]
  style: AnnotationStyle
  /** A `text` or `callout` annotation's label; on any other type, a caption beside it. */
  text?: string
  /** A `marker`'s shape. Default `circle`. */
  shape?: MarkerShape
  /** Locked drawings can be selected but not moved or reshaped by pointer. */
  locked?: boolean
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

/**
 * Style and shape a tool starts its drawings with, e.g. a trend line
 * extended past its end (a ray) or an up-arrow marker. See `setTool()`.
 */
export interface ToolPreset {
  style?: AnnotationStyle
  shape?: MarkerShape
}

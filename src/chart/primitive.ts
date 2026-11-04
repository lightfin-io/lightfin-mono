import type { UTCTimestamp } from '../data/types'
import type { PlotRect } from './chart'

/** A pointer event in chart terms, handed to {@link ChartPrimitive} hooks. */
export interface ChartPointerEvent {
  /** Position in CSS px relative to the chart element. */
  point: { x: number; y: number }
  /**
   * Time of the bar slot nearest the pointer, extrapolated past either end of
   * the data; null when there is no data.
   */
  time: UTCTimestamp | null
  /**
   * Price at the pointer on the main pane's scale — snapped to the hovered
   * bar's OHLC in magnet crosshair mode.
   */
  price: number
  /** Whether the pointer is inside the main (price) pane. */
  inMainPane: boolean
  /** The underlying DOM event (modifier keys, pointer type, …). */
  source: PointerEvent
}

/** Where a primitive draws: the main pane rect and the device pixel ratio. */
export interface PrimitiveView {
  pane: PlotRect
  dpr: number
}

/**
 * Custom drawing and interaction on the main pane, attached with
 * `chart.attachPrimitive()`. This is how the annotations module plugs in
 * without the core depending on it. Draw hooks are not clipped; clip to
 * `view.pane` as needed. Map coordinates with `chart.timeToCoordinate()` /
 * `chart.priceToCoordinate()` and their inverses.
 */
export interface ChartPrimitive {
  /**
   * Paint on the series layer, above the series and indicators. Repainted
   * with data/viewport changes or {@link PrimitiveHandle.redraw}.
   */
  draw?(ctx: CanvasRenderingContext2D, view: PrimitiveView): void
  /**
   * Paint on the overlay layer, under the crosshair. Repainted on every
   * pointer move, so keep it to what's in flight.
   */
  drawOverlay?(ctx: CanvasRenderingContext2D, view: PrimitiveView): void
  /**
   * A press started. Return true to claim it: it won't pan, and its moves and
   * release go to this primitive alone (the pointer is captured).
   */
  pointerDown?(e: ChartPointerEvent): boolean
  /** The pointer moved: dragging a claimed press, or hovering (mouse/pen). */
  pointerMove?(e: ChartPointerEvent, dragging: boolean): void
  /** A claimed press ended (released or cancelled). */
  pointerUp?(e: ChartPointerEvent): void
  /** CSS cursor to show at this pointer position, or null for the default. */
  cursor?(e: ChartPointerEvent): string | null
}

export interface PrimitiveHandle {
  /** Repaint the primitive: both layers, or just the overlay for in-flight changes. */
  redraw(layer?: 'overlay'): void
  detach(): void
}

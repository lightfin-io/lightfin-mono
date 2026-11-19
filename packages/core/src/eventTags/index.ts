/**
 * @lightfin/core/event-tags — small tags along the bottom of the price pane
 * for scheduled events: earnings (E), dividends (D), or anything
 * the host wants to flag against a time. Built on the core primitive hook,
 * sibling to `/price-lines`.
 *
 * Like the order-intent hook, the library owns only the marker: a
 * click fires `onSelect` with the event and its on-screen position, and the
 * host renders whatever detail popover or modal it likes — TradingView opens
 * an earnings card centered above the tag.
 *
 * ```ts
 * import { addEventTags } from '@lightfin/core/event-tags'
 * const tags = addEventTags(chart, {
 *   events: [
 *     { time: 1700000000, type: 'earnings', title: 'Q3 earnings', body: 'EPS 1.24 vs 1.10 est.' },
 *     { time: 1701200000, type: 'dividend', title: 'Dividend', body: '$0.24 / share' },
 *   ],
 *   onSelect: (e, pos) => openMyCard(e, pos.clientPoint),
 * })
 * tags.setEvents(next) // replace the set
 * ```
 */
import type { Chart } from '../chart/chart'
import type { PrimitiveHandle, PrimitiveView } from '../chart/primitive'
import type { UTCTimestamp } from '../data/types'

/** A scheduled event anchored to a time, shown as a tag at the bottom of the pane. */
export interface ChartEvent {
  /** When the event happens, in Unix seconds UTC (matched to the nearest bar). */
  time: UTCTimestamp
  /**
   * Event kind. `'earnings'` and `'dividend'` get default letters (E/D) and
   * colors; any other string is shown by its first letter unless `label` is
   * set. Passed back unchanged on select.
   */
  type?: string
  /** Character drawn in the tag. Defaults from {@link ChartEvent.type}. */
  label?: string
  /** Tag fill color. Defaults from {@link ChartEvent.type}, then the theme. */
  color?: string
  /** Heading for the host's popover (not drawn by the library). */
  title?: string
  /** Body text for the host's popover (not drawn by the library). */
  body?: string
  /** Any host payload, handed back untouched on select. */
  data?: unknown
}

/** Where a selected tag sits, so the host can place its popover. */
export interface EventTagPosition {
  /** Tag anchor (top-center) in CSS px relative to the chart element. */
  point: { x: number; y: number }
  /** The same anchor in client (viewport) px, e.g. for a `position: fixed` popover. */
  clientPoint: { x: number; y: number }
}

export interface EventTagsOptions {
  events: ChartEvent[]
  /** A tag was clicked or tapped; render the host's detail popover here. */
  onSelect?: (event: ChartEvent, pos: EventTagPosition) => void
}

export interface EventTags {
  /** Replace the whole set of events; the tags repaint. */
  setEvents(events: ChartEvent[]): void
  remove(): void
}

const DEFAULTS: Record<
  string,
  { label: string; themeColor: 'lineColor' | 'upColor' }
> = {
  earnings: { label: 'E', themeColor: 'lineColor' },
  dividend: { label: 'D', themeColor: 'upColor' },
}

// Tag box: a rounded badge sitting just above the time axis. Rows stack
// upward when neighbouring tags would overlap.
const PAD_X = 5
const BOX_H = 16
const BOTTOM_GAP = 6
const ROW_GAP = 3
// Min horizontal gap (CSS px) between two tags before the later one stacks up.
const MIN_GAP = 2
// How far (CSS px) the pointer may move between press and release and still
// count as a click rather than a drag.
const CLICK_SLOP = 4

interface TagRect {
  event: ChartEvent
  cx: number
  left: number
  top: number
  width: number
}

/**
 * Attach event tags to the main pane. Returns a handle to swap the events out
 * or remove the tags entirely.
 */
export function addEventTags(
  chart: Chart,
  options: EventTagsOptions,
): EventTags {
  let events = [...options.events].sort((a, b) => a.time - b.time)
  let hoveredIndex = -1
  // Set on pointerDown over a tag; cleared on release. Tracks whether the
  // pointer wandered far enough to be a drag rather than a click.
  let press: { index: number; x: number; y: number; moved: boolean } | null =
    null

  const themeColor = (ev: ChartEvent): string => {
    const { theme } = chart.getOptions()
    if (ev.color) return ev.color
    const def = ev.type ? DEFAULTS[ev.type] : undefined
    return def ? theme[def.themeColor] : theme.lineColor
  }
  const labelOf = (ev: ChartEvent): string => {
    if (ev.label) return ev.label
    const def = ev.type ? DEFAULTS[ev.type] : undefined
    if (def) return def.label
    return ev.type ? ev.type.charAt(0).toUpperCase() : '•'
  }

  // Current on-screen rectangles, recomputed on demand (cheap — few events)
  // so draw and hit-testing always agree with the live viewport.
  const layout = (): TagRect[] => {
    const { main } = chart.paneLayout()
    const { theme } = chart.getOptions()
    const measure = measureCtx(theme.fontSize, theme.fontFamily)
    const rowRight: number[] = []
    const rects: TagRect[] = []
    for (const event of events) {
      const cx = chart.timeToCoordinate(event.time)
      if (cx == null) continue
      const width = Math.max(
        BOX_H,
        measure.measureText(labelOf(event)).width + PAD_X * 2,
      )
      const left = cx - width / 2
      if (left + width < main.left || left > main.left + main.width) continue
      let row = 0
      while (rowRight[row] != null && rowRight[row]! > left - MIN_GAP) row++
      rowRight[row] = left + width
      const top =
        main.top + main.height - BOTTOM_GAP - BOX_H - row * (BOX_H + ROW_GAP)
      rects.push({ event, cx, left, top, width })
    }
    return rects
  }

  const hitIndex = (point: { x: number; y: number }): number => {
    const rects = layout()
    // Topmost (last drawn) first.
    for (let i = rects.length - 1; i >= 0; i--) {
      const r = rects[i]!
      if (
        point.x >= r.left &&
        point.x <= r.left + r.width &&
        point.y >= r.top &&
        point.y <= r.top + BOX_H
      ) {
        // Map back to the index in `events` for select/hover state.
        return events.indexOf(r.event)
      }
    }
    return -1
  }

  const handle: PrimitiveHandle = chart.attachPrimitive({
    draw: (ctx, view) =>
      drawTags(ctx, view, layout(), themeColor, labelOf, chart),
    drawOverlay: (ctx, view) => {
      if (hoveredIndex < 0) return
      const r = layout().find(t => events.indexOf(t.event) === hoveredIndex)
      if (r) drawHighlight(ctx, view, r)
    },
    pointerDown: e => {
      const index = hitIndex(e.point)
      if (index < 0) return false
      e.source.preventDefault()
      press = { index, x: e.point.x, y: e.point.y, moved: false }
      return true
    },
    pointerMove: (e, dragging) => {
      if (press && dragging) {
        if (
          Math.abs(e.point.x - press.x) > CLICK_SLOP ||
          Math.abs(e.point.y - press.y) > CLICK_SLOP
        ) {
          press.moved = true
        }
        return
      }
      // Hover (mouse/pen): highlight the tag under the pointer.
      const index = hitIndex(e.point)
      if (index !== hoveredIndex) {
        hoveredIndex = index
        handle.redraw('overlay')
      }
    },
    pointerUp: e => {
      const p = press
      press = null
      if (!p || p.moved) return
      if (hitIndex(e.point) !== p.index) return
      const event = events[p.index]
      if (event) options.onSelect?.(event, position(chart, event.time))
    },
    cursor: e => (hitIndex(e.point) >= 0 ? 'pointer' : null),
  })

  return {
    setEvents(next) {
      events = [...next].sort((a, b) => a.time - b.time)
      hoveredIndex = -1
      press = null
      handle.redraw()
    },
    remove() {
      handle.detach()
    },
  }
}

/** The tag's top-center anchor, in both chart-relative and client coordinates. */
function position(chart: Chart, time: UTCTimestamp): EventTagPosition {
  const { main } = chart.paneLayout()
  const cx = chart.timeToCoordinate(time) ?? main.left
  const top = main.top + main.height - BOTTOM_GAP - BOX_H
  const box = chart.element.getBoundingClientRect()
  return {
    point: { x: cx, y: top },
    clientPoint: { x: box.left + cx, y: box.top + top },
  }
}

function drawTags(
  ctx: CanvasRenderingContext2D,
  { pane, dpr }: PrimitiveView,
  rects: TagRect[],
  themeColor: (ev: ChartEvent) => string,
  labelOf: (ev: ChartEvent) => string,
  chart: Chart,
): void {
  const { theme } = chart.getOptions()
  ctx.save()
  // Keep tags inside the main pane.
  ctx.beginPath()
  ctx.rect(pane.left, pane.top, pane.width, pane.height)
  ctx.clip()
  ctx.font = `${theme.fontSize}px ${theme.fontFamily}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  for (const r of rects) {
    const color = themeColor(r.event)
    roundRect(ctx, r.left, r.top, r.width, BOX_H, 3, dpr)
    ctx.fillStyle = color
    ctx.fill()
    ctx.fillStyle = theme.background
    ctx.fillText(labelOf(r.event), r.cx, r.top + BOX_H / 2 + 0.5)
  }
  ctx.restore()
}

function drawHighlight(
  ctx: CanvasRenderingContext2D,
  { pane, dpr }: PrimitiveView,
  r: TagRect,
): void {
  if (r.cx < pane.left || r.cx > pane.left + pane.width) return
  ctx.save()
  roundRect(ctx, r.left - 1, r.top - 1, r.width + 2, BOX_H + 2, 4, dpr)
  ctx.strokeStyle = 'rgba(255,255,255,0.9)'
  ctx.lineWidth = 1.5
  ctx.stroke()
  ctx.restore()
}

/** A device-pixel-snapped rounded rectangle path. */
function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number,
  dpr: number,
): void {
  const snap = (v: number) => Math.round(v * dpr) / dpr
  ctx.beginPath()
  ctx.roundRect(snap(x), snap(y), snap(w), snap(h), radius)
}

/** A detached canvas 2D context for text measurement only. */
let shared: CanvasRenderingContext2D | null = null
function measureCtx(
  fontSize: number,
  fontFamily: string,
): CanvasRenderingContext2D {
  shared ??= document.createElement('canvas').getContext('2d')!
  shared.font = `${fontSize}px ${fontFamily}`
  return shared
}

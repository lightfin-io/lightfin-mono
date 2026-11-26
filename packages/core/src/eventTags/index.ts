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
 *     { time: 1700000000, symbol: 'E', title: 'Q3 earnings', body: 'EPS 1.24 vs 1.10 est.' },
 *     { time: 1701200000, symbol: 'D', symbolColor: '#26a69a', title: 'Dividend', body: '$0.24 / share' },
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
  /** Bold white text drawn in the tag. Defaults to a bullet. */
  symbol?: string
  /** Tag fill and hover guide color. Defaults to the theme's `lineColor`. */
  symbolColor?: string
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
  events: readonly ChartEvent[]
  /** A tag was clicked or tapped; render the host's detail popover here. */
  onSelect?: (event: ChartEvent, pos: EventTagPosition) => void
  /**
   * The host's detail card. While it is showing (`hidden` is false), an
   * event guide stays visible. An outside press or Escape hides the card.
   */
  card?: HTMLElement
  /** Called along with hiding {@link EventTagsOptions.card}. */
  onDismiss?: () => void
}

export interface EventTags {
  /** Replace the whole set of events; the tags repaint. */
  setEvents(events: readonly ChartEvent[]): void
  remove(): void
}

// Tag box: a house-shaped badge sitting just above the time axis. Rows stack
// upward when neighbouring tags would overlap.
const PAD_X = 5
const ROOF_H = 5
const BOX_H = 16 + ROOF_H
const BOTTOM_GAP = 6
const ROW_GAP = 3
// Min horizontal gap (CSS px) between two tags before the later one stacks up.
const MIN_GAP = 2
// How far (CSS px) the pointer may move between press and release and still
// count as a click rather than a drag.
const CLICK_SLOP = 4

interface TagRect {
  event: ChartEvent
  index: number
  symbol: string
  color: string
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
  const { theme } = chart.getOptions()
  const font = `bold ${theme.fontSize}px ${theme.fontFamily}`
  const { card, onDismiss: dismiss } = options
  let events = [...options.events].sort((a, b) => a.time - b.time)
  let selectedIndex = -1
  // Set on pointerDown over a tag; cleared on release. Tracks whether the
  // pointer wandered far enough to be a drag rather than a click.
  let press: { index: number; x: number; y: number; moved: boolean } | null =
    null

  // Current on-screen rectangles, recomputed on demand (cheap — few events)
  // so draw and hit-testing always agree with the live viewport.
  const layout = (main = chart.paneLayout().main): TagRect[] => {
    const measure = measureCtx(font)
    const rowRight: number[] = []
    const rects: TagRect[] = []
    for (const [index, event] of events.entries()) {
      const cx = chart.timeToCoordinate(event.time)
      if (cx == null) continue
      const symbol = event.symbol || '•'
      const width = Math.max(
        BOX_H,
        measure.measureText(symbol).width + PAD_X * 2,
      )
      const left = cx - width / 2
      if (left + width < main.left || left > main.left + main.width) continue
      let row = 0
      while (rowRight[row] != null && rowRight[row]! > left - MIN_GAP) row++
      rowRight[row] = left + width
      const top =
        main.top + main.height - BOTTOM_GAP - BOX_H - row * (BOX_H + ROW_GAP)
      const color = event.symbolColor || theme.lineColor
      rects.push({ event, index, symbol, color, cx, left, top, width })
    }
    return rects
  }

  const hitTag = (
    point: { x: number; y: number },
    pane = chart.paneLayout().main,
  ): TagRect | undefined => {
    if (
      point.x < pane.left ||
      point.x > pane.left + pane.width ||
      point.y < pane.top ||
      point.y > pane.top + pane.height
    )
      return
    const rects = layout(pane)
    // Topmost (last drawn) first.
    for (let i = rects.length - 1; i >= 0; i--) {
      const r = rects[i]!
      if (
        point.x >= r.left &&
        point.x <= r.left + r.width &&
        point.y >= r.top &&
        point.y <= r.top + BOX_H
      ) {
        return r
      }
    }
  }

  const handle: PrimitiveHandle = chart.attachPrimitive({
    draw: (ctx, view) => drawTags(ctx, view, layout(view.pane), font),
    drawOverlay: (ctx, view) => {
      if (card?.hidden !== false || selectedIndex < 0) return
      const tag = layout(view.pane).find(r => r.index === selectedIndex)
      if (tag && guideFits(tag, view.pane)) drawGuide(ctx, view, tag)
    },
    drawCrosshairTimeLine: (ctx, view, point) => {
      const { pane } = view
      const tag = hitTag(point, pane)
      if (!tag || !guideFits(tag, pane)) return false
      if (tag.index !== selectedIndex || card?.hidden !== false) {
        drawGuide(ctx, view, tag)
      }
      drawHighlight(ctx, view, tag)
      return true
    },
    pointerDown: e => {
      const tag = hitTag(e.point)
      if (!tag) return false
      e.source.preventDefault()
      press = { index: tag.index, x: e.point.x, y: e.point.y, moved: false }
      return true
    },
    pointerMove: (e, dragging) => {
      if (
        press &&
        dragging &&
        (Math.abs(e.point.x - press.x) > CLICK_SLOP ||
          Math.abs(e.point.y - press.y) > CLICK_SLOP)
      ) {
        press.moved = true
      }
    },
    pointerUp: e => {
      const p = press
      press = null
      if (!p || p.moved || e.source.type === 'pointercancel') return
      const tag = hitTag(e.point)
      if (tag?.index !== p.index) return
      if (card) {
        selectedIndex = tag.index
        handle.redraw('overlay')
      }
      options.onSelect?.(tag.event, position(chart, tag))
    },
    cursor: e => (hitTag(e.point) ? 'pointer' : null),
  })

  // React and other hosts can open or close the card after the pointer event.
  const cardObserver =
    card &&
    new MutationObserver(() => {
      if (card.hidden) selectedIndex = -1
      handle.redraw('overlay')
    })
  if (cardObserver && card)
    cardObserver.observe(card, { attributeFilter: ['hidden'] })

  // Capture phase, so this runs before the chart takes pointer capture on the press.
  const cardOpen = () => (card ? !card.hidden : dismiss != null)
  const closeCard = () => {
    if (card) card.hidden = true
    dismiss?.()
  }
  const onPointerDown = (event: PointerEvent) => {
    if (!cardOpen()) return
    const target = event.target
    if (target instanceof Node && card?.contains(target)) return
    closeCard()
  }
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || !cardOpen()) return
    event.preventDefault()
    event.stopPropagation()
    closeCard()
  }
  if (card || dismiss) {
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('keydown', onKeyDown, true)
  }

  return {
    setEvents(next) {
      const selected = events[selectedIndex]
      events = [...next].sort((a, b) => a.time - b.time)
      selectedIndex = selected ? events.indexOf(selected) : -1
      press = null
      handle.redraw()
    },
    remove() {
      cardObserver?.disconnect()
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('keydown', onKeyDown, true)
      handle.detach()
    },
  }
}

/** The tag's top-center anchor, in both chart-relative and client coordinates. */
function position(chart: Chart, { cx, top }: TagRect): EventTagPosition {
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
  font: string,
): void {
  ctx.save()
  // Keep tags inside the main pane.
  ctx.beginPath()
  ctx.rect(pane.left, pane.top, pane.width, pane.height)
  ctx.clip()
  ctx.font = font
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  for (const r of rects) {
    housePath(ctx, r.left, r.top, r.width, BOX_H, dpr)
    ctx.fillStyle = r.color
    ctx.fill()
    ctx.fillStyle = '#fff'
    ctx.fillText(r.symbol, r.cx, r.top + (ROOF_H + BOX_H) / 2 + 0.5)
  }
  ctx.restore()
}

function guideFits(tag: TagRect, pane: PrimitiveView['pane']): boolean {
  return (
    tag.cx >= pane.left &&
    tag.cx <= pane.left + pane.width &&
    tag.top > pane.top
  )
}

function drawGuide(
  ctx: CanvasRenderingContext2D,
  { pane, dpr }: PrimitiveView,
  r: TagRect,
): void {
  ctx.save()
  const x = (Math.round(r.cx * dpr) + 0.5) / dpr
  ctx.beginPath()
  ctx.moveTo(x, r.top)
  ctx.lineTo(x, pane.top)
  ctx.strokeStyle = r.color
  ctx.lineWidth = 1
  ctx.setLineDash([4, 4])
  ctx.stroke()
  ctx.restore()
}

function drawHighlight(
  ctx: CanvasRenderingContext2D,
  { dpr }: PrimitiveView,
  r: TagRect,
): void {
  ctx.save()
  housePath(ctx, r.left - 1, r.top - 1, r.width + 2, BOX_H + 2, dpr)
  ctx.strokeStyle = 'rgba(255,255,255,0.9)'
  ctx.lineWidth = 1.5
  ctx.lineJoin = 'round'
  ctx.setLineDash([])
  ctx.stroke()
  ctx.restore()
}

/** A device-pixel-snapped house with a peaked roof and a flat base. */
function housePath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  dpr: number,
): void {
  const snap = (v: number) => Math.round(v * dpr) / dpr
  const left = snap(x)
  const right = snap(x + w)
  const eaves = snap(y + ROOF_H)
  const bottom = snap(y + h)
  ctx.beginPath()
  ctx.moveTo(snap(x + w / 2), snap(y))
  ctx.lineTo(right, eaves)
  ctx.lineTo(right, bottom)
  ctx.lineTo(left, bottom)
  ctx.lineTo(left, eaves)
  ctx.closePath()
}

/** A detached canvas 2D context for text measurement only. */
let shared: CanvasRenderingContext2D | null = null
function measureCtx(font: string): CanvasRenderingContext2D {
  shared ??= document.createElement('canvas').getContext('2d')!
  shared.font = font
  return shared
}

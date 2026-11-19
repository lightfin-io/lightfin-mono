/**
 * @lightfin/core/price-lines — host-managed horizontal price lines for
 * orders, positions, alerts, and the like, on the core primitive
 * hook. The host owns the state: a draggable line follows the pointer and
 * reports the price, and the host decides whether to keep it.
 *
 * ```ts
 * import { addPriceLine } from '@lightfin/core/price-lines'
 * const order = addPriceLine(chart, {
 *   price: 101.25,
 *   title: 'Buy limit 1.0',
 *   color: '#26a69a',
 *   draggable: true,
 * })
 * order.on('dragEnd', price => api.modifyOrder(id, price))
 * ```
 */
import type { Chart } from '../chart/chart'
import { Emitter } from '../chart/events'
import type {
  ChartPointerEvent,
  PrimitiveHandle,
  PrimitiveView,
} from '../chart/primitive'

export type PriceLineStyle = 'solid' | 'dashed' | 'dotted'

export interface PriceLineOptions {
  price: number
  /** Line, label, and axis badge color. Default: the theme's line color. */
  color: string
  /** Label drawn on the line at the right edge of the pane; empty for none. */
  title: string
  lineStyle: PriceLineStyle
  lineWidth: number
  /** Show the price in a badge on the price axis. */
  axisLabel: boolean
  /** Let the user drag the line vertically (see {@link PriceLineEventMap}). */
  draggable: boolean
}

/** Payloads of the events {@link PriceLine.on} can subscribe to. */
export interface PriceLineEventMap {
  /**
   * The user is dragging the line; it already sits at this price. Call
   * `setOptions({ price })` here to snap it (e.g. to the tick size).
   */
  drag: number
  /** A drag finished at this price — the moment to send an order update. */
  dragEnd: number
}

export interface PriceLine {
  readonly options: Readonly<PriceLineOptions>
  setOptions(patch: Partial<PriceLineOptions>): void
  on<K extends keyof PriceLineEventMap>(
    type: K,
    handler: (payload: PriceLineEventMap[K]) => void,
  ): () => void
  remove(): void
}

const DEFAULTS: Omit<PriceLineOptions, 'price' | 'color'> = {
  title: '',
  lineStyle: 'dashed',
  lineWidth: 1,
  axisLabel: true,
  draggable: false,
}
// How close (CSS px) to the line a press grabs it.
const HIT_SLOP = 4
const HIT_SLOP_TOUCH = 10

/**
 * Add a horizontal line at a price to the main pane. Lines added later draw
 * on top and are grabbed first where they overlap.
 */
export function addPriceLine(
  chart: Chart,
  options: Partial<PriceLineOptions> & { price: number },
): PriceLine {
  const opts: PriceLineOptions = {
    color: chart.getOptions().theme.lineColor,
    ...DEFAULTS,
    ...options,
  }
  const events = new Emitter<PriceLineEventMap>()
  // The pointer's offset from the line when the drag started, so grabbing it
  // a few px off doesn't make it jump; and whether it has moved since.
  let drag: { offset: number; moved: boolean } | null = null

  const lineY = () => chart.priceToCoordinate(opts.price)
  const hits = (e: ChartPointerEvent) => {
    const { main } = chart.paneLayout()
    const slop = e.source.pointerType === 'touch' ? HIT_SLOP_TOUCH : HIT_SLOP
    const y = lineY()
    return (
      opts.draggable &&
      y >= main.top &&
      y <= main.top + main.height &&
      Math.abs(e.point.y - y) <= slop
    )
  }

  const handle: PrimitiveHandle = chart.attachPrimitive({
    drawOverlay: (ctx, view) => draw(chart, ctx, view, opts),
    pointerDown: e => {
      if (!hits(e)) return false
      e.source.preventDefault()
      drag = { offset: e.point.y - lineY(), moved: false }
      return true
    },
    pointerMove: (e, dragging) => {
      if (!drag || !dragging) return
      const { main } = chart.paneLayout()
      const y = Math.min(
        Math.max(e.point.y - drag.offset, main.top),
        main.top + main.height,
      )
      drag.moved = true
      opts.price = chart.coordinateToPrice(y)
      handle.redraw('overlay')
      events.emit('drag', opts.price)
    },
    pointerUp: () => {
      const moved = drag?.moved
      drag = null
      if (moved) events.emit('dragEnd', opts.price)
    },
    cursor: e => (drag || hits(e) ? 'ns-resize' : null),
  })

  return {
    get options() {
      return opts
    },
    setOptions(patch) {
      Object.assign(opts, patch)
      handle.redraw('overlay')
    },
    on: (type, handler) => events.on(type, handler),
    remove() {
      handle.detach()
      events.clear()
    },
  }
}

function draw(
  chart: Chart,
  ctx: CanvasRenderingContext2D,
  { pane, dpr }: PrimitiveView,
  opts: PriceLineOptions,
): void {
  const y = chart.priceToCoordinate(opts.price)
  if (y < pane.top || y > pane.top + pane.height) return
  const { theme, priceAxisWidth } = chart.getOptions()
  const right = pane.left + pane.width
  const lineY = (Math.round(y * dpr) + (opts.lineWidth % 2) * 0.5) / dpr

  ctx.save()
  ctx.strokeStyle = opts.color
  ctx.lineWidth = opts.lineWidth
  ctx.setLineDash(
    opts.lineStyle === 'dashed'
      ? [6, 4]
      : opts.lineStyle === 'dotted'
        ? [1, 3]
        : [],
  )
  ctx.beginPath()
  ctx.moveTo(pane.left, lineY)
  ctx.lineTo(right, lineY)
  ctx.stroke()
  ctx.restore()

  const boxH = theme.fontSize + 8
  ctx.font = `${theme.fontSize}px ${theme.fontFamily}`
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'left'
  if (opts.title) {
    const boxW = ctx.measureText(opts.title).width + 12
    const x = right - boxW - 4
    ctx.fillStyle = theme.background
    ctx.fillRect(x, y - boxH / 2, boxW, boxH)
    ctx.strokeStyle = opts.color
    ctx.lineWidth = 1
    ctx.strokeRect(x + 0.5, y - boxH / 2 + 0.5, boxW - 1, boxH - 1)
    ctx.fillStyle = opts.color
    ctx.fillText(opts.title, x + 6, y)
  }
  if (opts.axisLabel) {
    ctx.fillStyle = opts.color
    ctx.fillRect(right, y - boxH / 2, priceAxisWidth, boxH)
    ctx.fillStyle = theme.background
    ctx.fillText(chart.formatPrice(opts.price), right + 6, y)
  }
}

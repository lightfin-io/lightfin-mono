import type { Chart, PlotRect } from '../chart/chart'
import { Emitter } from '../chart/events'
import type {
  ChartPointerEvent,
  PrimitiveHandle,
  PrimitiveView,
} from '../chart/primitive'
import type { Px } from './geometry'
import type { DrawEnv, Resolved } from './tools'
import { TOOLS, resolveStyle, textBox } from './tools'
import type {
  Annotation,
  AnnotationInput,
  AnnotationPoint,
  AnnotationType,
} from './types'

/** Payloads of the events {@link Annotations.on} can subscribe to. */
export interface AnnotationsEventMap {
  /**
   * A drawing was added, removed, moved, restyled, or edited — the moment to
   * persist {@link Annotations.toJSON}. Fires once at the end of a drag, and
   * not for {@link Annotations.load}.
   */
  change: void
  /** The active drawing tool changed (null: back to the cursor). */
  toolChange: AnnotationType | null
  /** The selected drawing's id, or null when nothing is selected. */
  selectionChange: string | null
}

const HANDLE_RADIUS = 5
// A press that moves less than this (CSS px) is a click: a two-point drawing
// then waits for a second click instead of finishing.
const CLICK_SLOP = 4

type Drag = { ann: Annotation; moved: boolean } & (
  | { kind: 'handle'; handle: readonly [number, number] }
  | { kind: 'move'; from: Px; orig: AnnotationPoint[] }
)

let seq = 0
const nextId = () =>
  `a${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`

/**
 * Drawing tools on a chart (PLAN §8.5): trend lines, horizontal/vertical
 * lines, rectangles, fib retracements, and text. Pick a tool with
 * {@link setTool}, then drag (or click twice) on the price pane; select a
 * drawing to drag it or its handles, Delete/Backspace removes it, Escape
 * cancels. Double-click a text label to edit it.
 *
 * Drawings anchor to time + price, so they hold their place across pan/zoom,
 * history backfill, and interval switches. Committed drawings paint on the
 * series layer; the selected one and any in progress paint on the overlay,
 * so dragging never repaints the rest.
 */
export class Annotations {
  private readonly chart: Chart
  private readonly handle: PrimitiveHandle
  private readonly events = new Emitter<AnnotationsEventMap>()
  private items: Annotation[] = []
  private selectedId: string | null = null
  private activeTool: AnnotationType | null = null
  // A two-point drawing being placed: its first point is down, the second
  // follows the pointer until a release (after a drag) or a second click.
  private draft: { ann: Annotation; down: Px } | null = null
  private drag: Drag | null = null
  private editor: { ann: Annotation; finish(commit: boolean): void } | null =
    null
  private readonly ownsTabIndex: boolean

  constructor(chart: Chart) {
    this.chart = chart
    const root = chart.element
    // Focusable so Delete/Escape reach it after a click on the chart.
    this.ownsTabIndex = !root.hasAttribute('tabindex')
    if (this.ownsTabIndex) {
      root.tabIndex = -1
      root.style.outline = 'none'
    }
    root.addEventListener('keydown', this.onKeyDown)
    root.addEventListener('dblclick', this.onDblClick)
    this.handle = chart.attachPrimitive({
      draw: (ctx, view) => this.draw(ctx, view),
      drawOverlay: (ctx, view) => this.drawOverlay(ctx, view),
      pointerDown: e => this.pointerDown(e),
      pointerMove: (e, dragging) => this.pointerMove(e, dragging),
      pointerUp: e => this.pointerUp(e),
      cursor: e => this.cursor(e),
    })
  }

  /** Subscribe to an event (see {@link AnnotationsEventMap}); returns an unsubscribe. */
  on<K extends keyof AnnotationsEventMap>(
    type: K,
    handler: (payload: AnnotationsEventMap[K]) => void,
  ): () => void {
    return this.events.on(type, handler)
  }

  /** The active drawing tool, or null for the cursor (select/move). */
  get tool(): AnnotationType | null {
    return this.activeTool
  }

  /** Arm a drawing tool (null: back to the cursor). Reverts to null after one drawing. */
  setTool(tool: AnnotationType | null): void {
    if (this.draft) {
      this.draft = null
      this.handle.redraw('overlay')
    }
    if (tool === this.activeTool) return
    this.activeTool = tool
    if (tool) this.select(null)
    this.events.emit('toolChange', tool)
  }

  /** The selected drawing's id, or null. */
  get selected(): string | null {
    return this.selectedId
  }

  select(id: string | null): void {
    if (id === this.selectedId) return
    this.selectedId = id
    this.handle.redraw()
    this.events.emit('selectionChange', id)
  }

  /** Every drawing, oldest (bottom) first, as plain JSON-safe copies. */
  list(): Annotation[] {
    return this.items.map(copy)
  }

  toJSON(): Annotation[] {
    return this.list()
  }

  get(id: string): Annotation | null {
    const ann = this.find(id)
    return ann ? copy(ann) : null
  }

  /** Add a drawing; returns its id. Throws if its points don't fit its type. */
  add(input: AnnotationInput): string {
    const ann = create(input)
    this.items.push(ann)
    this.changed()
    return ann.id
  }

  /** Replace all drawings, e.g. with ones restored from storage. */
  load(inputs: readonly AnnotationInput[]): void {
    this.closeEditor()
    this.items = inputs.map(create)
    this.selectedId = null
    this.handle.redraw()
    this.events.emit('selectionChange', null)
  }

  /** Move, restyle (merged over the current style), or relabel a drawing. */
  update(
    id: string,
    patch: Partial<Pick<Annotation, 'points' | 'style' | 'text'>>,
  ): void {
    const ann = this.find(id)
    if (!ann) return
    if (patch.points) {
      ann.points = create({ ...ann, points: patch.points }).points
    }
    if (patch.style) ann.style = { ...ann.style, ...patch.style }
    if (patch.text !== undefined) ann.text = patch.text
    this.changed()
  }

  remove(id: string): void {
    const ann = this.find(id)
    if (!ann) return
    if (this.editor?.ann === ann) this.closeEditor()
    this.items = this.items.filter(a => a !== ann)
    if (this.selectedId === id) this.select(null)
    this.changed()
  }

  clear(): void {
    if (this.items.length === 0) return
    this.closeEditor()
    this.items = []
    this.select(null)
    this.changed()
  }

  /** Detach from the chart and drop all listeners. */
  dispose(): void {
    this.closeEditor()
    this.handle.detach()
    const root = this.chart.element
    root.removeEventListener('keydown', this.onKeyDown)
    root.removeEventListener('dblclick', this.onDblClick)
    if (this.ownsTabIndex) {
      root.removeAttribute('tabindex')
      root.style.outline = ''
    }
    this.events.clear()
  }

  private find(id: string): Annotation | undefined {
    return this.items.find(a => a.id === id)
  }

  private changed(): void {
    this.handle.redraw()
    this.events.emit('change', undefined)
  }

  // --- Painting ---

  private env(view: PrimitiveView): DrawEnv {
    return {
      pane: view.pane,
      dpr: view.dpr,
      theme: this.chart.getOptions().theme,
      formatPrice: price => this.chart.formatPrice(price),
    }
  }

  /** Map an annotation's points to CSS px, or null with no data to anchor to. */
  private resolve(ann: Annotation): Resolved | null {
    const px: Px[] = []
    for (const p of ann.points) {
      const x = this.chart.timeToCoordinate(p.time)
      if (x === null) return null
      px.push({ x, y: this.chart.priceToCoordinate(p.price) })
    }
    return { ann, px, style: resolveStyle(ann, this.chart.getOptions().theme) }
  }

  private paint(
    ctx: CanvasRenderingContext2D,
    env: DrawEnv,
    ann: Annotation,
  ): Resolved | null {
    const r = this.resolve(ann)
    if (r) TOOLS[ann.type].draw(ctx, r, env)
    return r
  }

  private draw(ctx: CanvasRenderingContext2D, view: PrimitiveView): void {
    const env = this.env(view)
    ctx.save()
    clip(ctx, view.pane)
    for (const ann of this.items) {
      if (ann.id === this.selectedId || ann === this.editor?.ann) continue
      this.paint(ctx, env, ann)
    }
    ctx.restore()
  }

  private drawOverlay(
    ctx: CanvasRenderingContext2D,
    view: PrimitiveView,
  ): void {
    const env = this.env(view)
    const selected = this.selectedId ? this.find(this.selectedId) : undefined
    ctx.save()
    clip(ctx, view.pane)
    if (selected && selected !== this.editor?.ann) {
      const r = this.paint(ctx, env, selected)
      if (r) this.paintSelection(ctx, r, env)
    }
    if (this.draft) this.paint(ctx, env, this.draft.ann)
    ctx.restore()
    for (const ann of this.items) {
      if (ann.type === 'hline') this.paintPriceBadge(ctx, ann, env)
    }
  }

  private paintSelection(
    ctx: CanvasRenderingContext2D,
    r: Resolved,
    env: DrawEnv,
  ): void {
    ctx.setLineDash([])
    ctx.lineWidth = 1.5
    ctx.strokeStyle = r.style.color
    ctx.fillStyle = env.theme.background
    for (const h of this.handlePoints(r, env.pane)) {
      ctx.beginPath()
      ctx.arc(h.x, h.y, HANDLE_RADIUS, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
    }
    const box = r.ann.type === 'text' ? textBox(r.ann) : undefined
    if (box) {
      ctx.lineWidth = 1
      ctx.setLineDash([3, 3])
      ctx.strokeRect(
        box.a.x - 3,
        box.a.y - 2,
        box.b.x - box.a.x + 6,
        box.b.y - box.a.y + 4,
      )
    }
  }

  /** A horizontal line's price on the price axis, in the line's color. */
  private paintPriceBadge(
    ctx: CanvasRenderingContext2D,
    ann: Annotation,
    env: DrawEnv,
  ): void {
    const { pane, theme } = env
    const price = ann.points[0]!.price
    const y = this.chart.priceToCoordinate(price)
    if (y < pane.top || y > pane.top + pane.height) return
    const h = theme.fontSize + 8
    const x = pane.left + pane.width
    ctx.fillStyle = resolveStyle(ann, theme).color
    ctx.fillRect(x, y - h / 2, this.chart.getOptions().priceAxisWidth, h)
    ctx.font = `${theme.fontSize}px ${theme.fontFamily}`
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = theme.background
    ctx.fillText(env.formatPrice(price), x + 6, y)
  }

  /** Handle positions, kept inside the pane so off-screen anchors stay grabbable. */
  private handlePoints(r: Resolved, pane: PlotRect): Px[] {
    return TOOLS[r.ann.type].handles.map(([a, b]) => ({
      x: clamp(r.px[a]!.x, pane.left, pane.left + pane.width),
      y: clamp(r.px[b]!.y, pane.top, pane.top + pane.height),
    }))
  }

  // --- Interaction ---

  /** The drawing (and handle, on the selected one) under a point, topmost first. */
  private hitTest(
    p: Px,
  ): { ann: Annotation; handle?: readonly [number, number] } | null {
    const selected = this.selectedId ? this.find(this.selectedId) : undefined
    if (selected) {
      const r = this.resolve(selected)
      if (r) {
        const handles = this.handlePoints(r, this.chart.paneLayout().main)
        const i = handles.findIndex(
          h => Math.hypot(p.x - h.x, p.y - h.y) <= HANDLE_RADIUS + 3,
        )
        if (i !== -1) {
          return { ann: selected, handle: TOOLS[selected.type].handles[i]! }
        }
        if (TOOLS[selected.type].hit(r, p)) return { ann: selected }
      }
    }
    for (let i = this.items.length - 1; i >= 0; i--) {
      const ann = this.items[i]!
      const r = this.resolve(ann)
      if (r && TOOLS[ann.type].hit(r, p)) return { ann }
    }
    return null
  }

  private pointerDown(e: ChartPointerEvent): boolean {
    this.closeEditor()
    if (!e.inMainPane || e.time === null) {
      if (!this.draft) this.select(null)
      return false
    }
    const point = { time: e.time, price: e.price }

    if (this.draft) {
      this.draft.ann.points[1] = point
      this.commitDraft()
      return this.claim(e)
    }

    const tool = this.activeTool
    if (tool) {
      const ann = create({
        type: tool,
        points: Array.from({ length: TOOLS[tool].points }, () => ({
          ...point,
        })),
      })
      if (ann.points.length === 2) {
        this.draft = { ann, down: e.point }
        this.handle.redraw('overlay')
        return this.claim(e)
      }
      this.items.push(ann)
      this.setTool(null)
      this.select(ann.id)
      if (tool === 'text') {
        this.openEditor(ann, true)
        e.source.preventDefault()
        return true
      }
      this.changed()
      return this.claim(e)
    }

    const hit = this.hitTest(e.point)
    if (!hit) {
      this.select(null)
      return false
    }
    this.select(hit.ann.id)
    this.drag = hit.handle
      ? { kind: 'handle', ann: hit.ann, handle: hit.handle, moved: false }
      : {
          kind: 'move',
          ann: hit.ann,
          from: e.point,
          orig: hit.ann.points.map(p => ({ ...p })),
          moved: false,
        }
    return this.claim(e)
  }

  /** Take the press: focus the chart for keys, and keep the browser from selecting text. */
  private claim(e: ChartPointerEvent): true {
    e.source.preventDefault()
    this.chart.element.focus({ preventScroll: true })
    return true
  }

  private pointerMove(e: ChartPointerEvent, dragging: boolean): void {
    if (this.draft) {
      if (e.time === null) return
      this.draft.ann.points[1] = { time: e.time, price: e.price }
      this.handle.redraw('overlay')
      return
    }
    const drag = this.drag
    if (!drag || !dragging) return
    if (drag.kind === 'handle') {
      if (e.time === null) return
      const [a, b] = drag.handle
      drag.ann.points[a]!.time = e.time
      drag.ann.points[b]!.price = e.price
    } else {
      // Whole bars horizontally so points stay on bar times; free in price.
      const { chart } = this
      const barWidth = chart.timeScale().barWidth
      const bars = Math.round((e.point.x - drag.from.x) / barWidth)
      const dPrice =
        chart.coordinateToPrice(e.point.y) -
        chart.coordinateToPrice(drag.from.y)
      drag.ann.points = drag.orig.map(p => {
        const x = bars === 0 ? null : chart.timeToCoordinate(p.time)
        const time =
          x === null
            ? p.time
            : (chart.coordinateToTime(x + bars * barWidth) ?? p.time)
        return { time, price: p.price + dPrice }
      })
    }
    drag.moved = true
    this.handle.redraw('overlay')
  }

  private pointerUp(e: ChartPointerEvent): void {
    if (this.draft) {
      const { down } = this.draft
      if (Math.hypot(e.point.x - down.x, e.point.y - down.y) > CLICK_SLOP) {
        if (e.time !== null) {
          this.draft.ann.points[1] = { time: e.time, price: e.price }
        }
        this.commitDraft()
      }
      return
    }
    const drag = this.drag
    this.drag = null
    if (drag?.moved) this.changed()
  }

  private commitDraft(): void {
    const { ann } = this.draft!
    this.draft = null
    this.items.push(ann)
    this.setTool(null)
    this.select(ann.id)
    this.changed()
  }

  private cursor(e: ChartPointerEvent): string | null {
    if (this.activeTool || this.draft) return 'crosshair'
    if (this.drag) return 'grabbing'
    return e.inMainPane && this.hitTest(e.point) ? 'pointer' : null
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    if (e.target !== this.chart.element) return
    if (e.key === 'Escape') {
      if (this.draft || this.activeTool) this.setTool(null)
      else this.select(null)
    } else if (
      (e.key === 'Delete' || e.key === 'Backspace') &&
      this.selectedId
    ) {
      this.remove(this.selectedId)
    } else {
      return
    }
    e.preventDefault()
  }

  private onDblClick = (e: MouseEvent): void => {
    const box = this.chart.element.getBoundingClientRect()
    const hit = this.hitTest({
      x: e.clientX - box.left,
      y: e.clientY - box.top,
    })
    if (hit?.ann.type === 'text') this.openEditor(hit.ann, false)
  }

  /**
   * Edit a text label in place. Enter or clicking away commits; Escape
   * reverts. A label left empty is removed.
   */
  private openEditor(ann: Annotation, isNew: boolean): void {
    this.closeEditor()
    const r = this.resolve(ann)
    if (!r) return
    const { theme } = this.chart.getOptions()
    const size = r.style.fontSize
    const input = document.createElement('input')
    input.value = ann.text ?? ''
    input.setAttribute('aria-label', 'Drawing text')
    Object.assign(input.style, {
      position: 'absolute',
      zIndex: '2',
      left: `${r.px[0]!.x - 3}px`,
      top: `${r.px[0]!.y - size * 0.7 - 3}px`,
      height: `${size * 1.4}px`,
      minWidth: '10em',
      padding: '2px',
      border: `1px solid ${r.style.color}`,
      borderRadius: '2px',
      outline: 'none',
      background: theme.background,
      color: r.style.color,
      font: `${size}px ${theme.fontFamily}`,
    })

    let done = false
    const finish = (commit: boolean) => {
      if (done) return
      done = true
      this.editor = null
      input.remove()
      const text = input.value.trim()
      if (commit && text) {
        if (text === ann.text) this.handle.redraw()
        else {
          ann.text = text
          this.changed()
        }
      } else if (isNew) {
        this.items = this.items.filter(a => a !== ann)
        this.select(null)
        this.handle.redraw()
      } else if (commit) {
        this.remove(ann.id)
      } else {
        this.handle.redraw()
      }
      this.chart.element.focus({ preventScroll: true })
    }
    input.addEventListener('keydown', e => {
      e.stopPropagation()
      if (e.key === 'Enter') finish(true)
      else if (e.key === 'Escape') finish(false)
    })
    input.addEventListener('blur', () => finish(true))
    // Keep the chart from panning or re-opening the editor under the input.
    input.addEventListener('pointerdown', e => e.stopPropagation())
    input.addEventListener('dblclick', e => e.stopPropagation())

    this.editor = { ann, finish }
    this.handle.redraw()
    this.chart.element.append(input)
    input.focus()
  }

  /** Commit any open text edit. */
  private closeEditor(): void {
    this.editor?.finish(true)
  }
}

function create(input: AnnotationInput): Annotation {
  const spec = TOOLS[input.type]
  if (!spec)
    throw new Error(`lightfin: unknown annotation type "${input.type}"`)
  if (input.points.length !== spec.points) {
    throw new Error(
      `lightfin: a ${input.type} annotation takes ${spec.points} point(s), got ${input.points.length}`,
    )
  }
  const ann: Annotation = {
    id: input.id ?? nextId(),
    type: input.type,
    points: input.points.map(p => ({ time: p.time, price: p.price })),
    style: { ...input.style },
  }
  if (input.text !== undefined) ann.text = input.text
  return ann
}

function copy(ann: Annotation): Annotation {
  return {
    ...ann,
    points: ann.points.map(p => ({ ...p })),
    style: { ...ann.style },
  }
}

function clip(ctx: CanvasRenderingContext2D, rect: PlotRect): void {
  ctx.beginPath()
  ctx.rect(rect.left, rect.top, rect.width, rect.height)
  ctx.clip()
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value
}

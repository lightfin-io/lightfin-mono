import type { Chart, PlotRect } from '../chart/chart'
import { Emitter } from '../chart/events'
import { chartStorageKey } from '../chart/persistence'
import type {
  ChartPointerEvent,
  PrimitiveHandle,
  PrimitiveView,
} from '../chart/primitive'
import { fibLevels } from './fib'
import type { Fit, Px } from './geometry'
import { fitCloses } from './geometry'
import type { AnnotationsOptions } from './persistence'
import { localStorageDrawingPersistence, persistDrawings } from './persistence'
import type { DrawEnv, Resolved } from './tools'
import {
  TOOLS,
  drawAnnotation,
  effectiveStyle,
  handlePositions,
  hitAnnotation,
  labelBox,
  resolveStyle,
} from './tools'
import type {
  Annotation,
  AnnotationInput,
  AnnotationPoint,
  AnnotationStyle,
  AnnotationType,
  ToolPreset,
} from './types'
import { validateAnnotation } from './validate'

/** Payloads of the events {@link Annotations.on} can subscribe to. */
export interface AnnotationsEventMap {
  /**
   * Persist {@link Annotations.toJSON} when the drawings change, including
   * visibility edits and undo or redo. Fires once at the end of a drag and
   * skips {@link Annotations.load}.
   */
  change: void
  /** The active drawing tool changed (null: back to the cursor). */
  toolChange: AnnotationType | null
  /** The selected drawing's id, or null when nothing is selected. */
  selectionChange: string | null
}

/** What {@link Annotations.update} can change. */
export type AnnotationPatch = Partial<
  Pick<
    Annotation,
    'points' | 'style' | 'text' | 'shape' | 'locked' | 'hidden' | 'hiddenLevels'
  >
>

const HANDLE_RADIUS = 5
// A press that moves less than this (CSS px) is a click: a multi-point
// drawing then waits for another click instead of placing its next point.
const CLICK_SLOP = 4
// A freehand stroke samples the pointer every this many CSS px.
const FREEHAND_STEP = 3
const HISTORY_LIMIT = 100
// A clone lands about this far (CSS px) right of and below its original.
const CLONE_OFFSET = 16
const LINE_HEIGHT = 1.3

type Drag = { ann: Annotation; moved: boolean } & (
  | { kind: 'handle'; handle: readonly [number, number] }
  | { kind: 'move'; from: Px; orig: AnnotationPoint[] }
)

// A drawing being placed: `placed` of its points are down, the rest follow
// the pointer. A freehand one grows a point per sample while dragging.
interface Draft {
  ann: Annotation
  placed: number
  down: Px
  last: Px
}

let seq = 0
const nextId = () =>
  `a${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`

/**
 * Drawing tools on a chart: lines, channels, Fibonacci, Gann, patterns,
 * shapes, labels, and measurements (see {@link AnnotationType}). Pick a tool
 * with {@link setTool}, then drag or click out its points on the price pane;
 * select a drawing to drag it or its handles. Delete/Backspace removes the
 * selection, Escape cancels, Ctrl/⌘+Z undoes (Shift, or Ctrl+Y, redoes), and
 * double-clicking a text or callout edits it.
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
  private preset: ToolPreset | undefined
  private sticky = false
  private allLocked = false
  private shown = true
  private draft: Draft | null = null
  private drag: Drag | null = null
  private editor: { ann: Annotation; finish(commit: boolean): void } | null =
    null
  // Undo history: the drawings before each change, and after each undo.
  private past: Annotation[][] = []
  private future: Annotation[][] = []
  private snapshot: Annotation[] = []
  // Regression fits, recomputed only when their range or the data changes.
  private readonly fits = new WeakMap<
    Annotation,
    { key: string; fit: Fit | null }
  >()
  private readonly ownsTabIndex: boolean
  private readonly persistence?: ReturnType<typeof persistDrawings>

  constructor(chart: Chart, options: AnnotationsOptions = {}) {
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
    if (options.persistence !== false) {
      const storage =
        options.persistence ??
        localStorageDrawingPersistence(
          options.persistenceKey ??
            chartStorageKey(root, 'drawings', chart.instrument()),
        )
      this.persistence = persistDrawings(
        this,
        storage,
        options.onPersistenceError,
      )
    }
  }

  /** Resolves after the initial restore, including asynchronous adapters. */
  get ready(): Promise<void> {
    return this.persistence?.ready ?? Promise.resolve()
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

  /** The preset the active tool was armed with, if any. */
  get toolPreset(): ToolPreset | undefined {
    return this.preset
  }

  /**
   * Arm a drawing tool (null: back to the cursor), optionally with a preset
   * its drawings start from — `setTool('trendline', { style: { extend:
   * 'end' } })` draws rays. Reverts to the cursor after one drawing unless
   * {@link setStickyTool} is on.
   */
  setTool(tool: AnnotationType | null, preset?: ToolPreset): void {
    if (this.draft) {
      this.draft = null
      this.handle.redraw('overlay')
    }
    const next = tool ? preset : undefined
    if (tool === this.activeTool && next === this.preset) return
    this.activeTool = tool
    this.preset = next
    if (tool) {
      this.select(null)
      if (!this.shown) this.setVisible(true)
    }
    this.events.emit('toolChange', tool)
  }

  /** Whether the tool stays armed after a drawing. */
  get stickyTool(): boolean {
    return this.sticky
  }

  /** Keep the tool armed after each drawing (Escape returns to the cursor). */
  setStickyTool(on: boolean): void {
    this.sticky = on
  }

  /** Whether every drawing is locked against moving, regardless of its own `locked`. */
  get locked(): boolean {
    return this.allLocked
  }

  setLocked(on: boolean): void {
    this.allLocked = on
    this.drag = null
    this.handle.redraw('overlay')
  }

  /** Whether drawings are shown globally. Individual drawings may still be hidden. */
  get visible(): boolean {
    return this.shown
  }

  /** Toggle global visibility. Arming a tool restores it. */
  setVisible(on: boolean): void {
    if (on === this.shown) return
    this.shown = on
    if (!on) {
      this.closeEditor()
      this.select(null)
      this.setTool(null)
    }
    this.handle.redraw()
  }

  /** The selected drawing's id, or null. */
  get selected(): string | null {
    return this.selectedId
  }

  /** Select a drawing, or clear the selection with null. Hidden ids are ignored. */
  select(id: string | null): void {
    if (id === this.selectedId) return
    if (id !== null && this.find(id)?.hidden) return
    this.selectedId = id
    this.handle.redraw()
    this.events.emit('selectionChange', id)
  }

  /**
   * Every drawing (or just `group`'s), oldest (bottom) first, as plain
   * JSON-safe copies.
   */
  list(group?: string): Annotation[] {
    const items =
      group === undefined
        ? this.items
        : this.items.filter(a => a.group === group)
    return items.map(copy)
  }

  toJSON(): Annotation[] {
    return this.list()
  }

  get(id: string): Annotation | null {
    const ann = this.find(id)
    return ann ? copy(ann) : null
  }

  /** The supported Fibonacci ratios for a drawing, or null for other drawings or unknown ids. */
  fibLevels(id: string): readonly number[] | null {
    const levels = fibLevels(this.find(id)?.type)
    return levels ? [...levels] : null
  }

  /**
   * The style a drawing paints with, theme defaults filled in — e.g. for a
   * style editor to show. Null for an unknown id.
   */
  effectiveStyle(id: string): AnnotationStyle | null {
    const ann = this.find(id)
    return ann ? effectiveStyle(ann, this.chart.getOptions().theme) : null
  }

  /**
   * Add a drawing; returns its id. Throws, listing every problem (see
   * {@link validateAnnotation}), if it's malformed or its id is taken.
   */
  add(input: AnnotationInput): string {
    const [ann] = createAll([input], this.items)
    this.items.push(ann!)
    this.changed()
    return ann!.id
  }

  /**
   * Replace all drawings, e.g. with ones restored from storage, and start a
   * fresh undo history. Throws if any is malformed.
   */
  load(inputs: readonly AnnotationInput[]): void {
    const items = createAll(inputs, [])
    this.closeEditor()
    this.draft = null
    this.drag = null
    this.items = items
    this.selectedId = null
    this.past = []
    this.future = []
    this.snapshot = items.map(copy)
    this.handle.redraw()
    this.events.emit('selectionChange', null)
  }

  /**
   * Swap `group`'s drawings for `inputs` (each tagged with `group`) in one
   * change, leaving every other drawing alone — e.g. an AI's latest
   * analysis replacing its previous one. Validates all first, so a malformed
   * input changes nothing. Returns the new ids.
   */
  replace(group: string, inputs: readonly AnnotationInput[]): string[] {
    const kept = this.items.filter(a => a.group !== group)
    const added = createAll(inputs, kept, group)
    if (this.editor && this.editor.ann.group === group) this.closeEditor()
    if (this.drag?.ann.group === group) this.drag = null
    this.items = [...kept, ...added]
    this.clearUnavailableSelection()
    this.changed()
    return added.map(a => a.id)
  }

  /**
   * Move, restyle, relabel, reshape, lock, or hide a drawing. Style is merged
   * over the current style; an `undefined` field reverts to its default.
   * Set `hiddenLevels` to `[]` to show all Fibonacci levels again.
   * Throws, changing nothing, if the result is malformed.
   */
  update(id: string, patch: AnnotationPatch): void {
    let current = this.find(id)
    if (!current) return
    let next = applyPatch(current, patch)
    if (this.editor?.ann === current) {
      this.closeEditor()
      current = this.find(id)
      if (!current) return
      next = applyPatch(current, patch)
    }
    const i = this.items.indexOf(current)
    if (this.drag?.ann === current) this.drag = null
    this.items[i] = next
    if (next.hidden && this.selectedId === id) this.select(null)
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

  /** Remove every drawing, or just `group`'s. */
  clear(group?: string): void {
    if (group !== undefined) {
      this.replace(group, [])
      return
    }
    if (this.items.length === 0) return
    this.closeEditor()
    this.items = []
    this.select(null)
    this.changed()
  }

  /**
   * Copy a drawing a little right of and below the original and select it.
   * The copy is on top, unlocked, visible, and owned by the user. Returns
   * its id, or null for an unknown id.
   */
  clone(id: string): string | null {
    const ann = this.find(id)
    if (!ann) return null
    const dx = Math.max(CLONE_OFFSET, this.chart.timeScale().barWidth)
    const twin = build({
      type: ann.type,
      points: this.shifted(ann.points, dx, CLONE_OFFSET),
      style: ann.style,
      text: ann.text,
      shape: ann.shape,
      hiddenLevels: ann.hiddenLevels,
    })
    this.items.push(twin)
    this.select(twin.id)
    this.changed()
    return twin.id
  }

  /** Draw a drawing above all others. */
  bringToFront(id: string): void {
    this.reorder(id, true)
  }

  /** Draw a drawing below all others. */
  sendToBack(id: string): void {
    this.reorder(id, false)
  }

  get canUndo(): boolean {
    return this.past.length > 0
  }

  get canRedo(): boolean {
    return this.future.length > 0
  }

  /** Revert the last change; false when there's nothing to undo. */
  undo(): boolean {
    this.closeEditor()
    const state = this.past.pop()
    if (!state) return false
    this.future.push(this.snapshot)
    this.restore(state)
    return true
  }

  /** Reapply the last undone change; false when there's nothing to redo. */
  redo(): boolean {
    this.closeEditor()
    const state = this.future.pop()
    if (!state) return false
    this.past.push(this.snapshot)
    this.restore(state)
    return true
  }

  /** Edit a drawing's text (a caption, for types that aren't text) in place. */
  editText(id: string): void {
    const ann = this.find(id)
    if (!ann || ann.hidden || !this.shown) return
    this.select(id)
    if (this.selectedId === id) this.openEditor(ann, false)
  }

  /** Detach from the chart and drop all listeners. */
  dispose(): void {
    this.closeEditor()
    this.persistence?.dispose()
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

  private clearUnavailableSelection(): void {
    if (this.selectedId === null) return
    const selected = this.find(this.selectedId)
    if (!selected || selected.hidden) this.select(null)
  }

  private changed(): void {
    this.past.push(this.snapshot)
    if (this.past.length > HISTORY_LIMIT) this.past.shift()
    this.future = []
    this.snapshot = this.items.map(copy)
    this.handle.redraw()
    this.events.emit('change', undefined)
  }

  private restore(state: Annotation[]): void {
    this.drag = null
    this.snapshot = state
    this.items = state.map(copy)
    this.clearUnavailableSelection()
    this.handle.redraw()
    this.events.emit('change', undefined)
  }

  private reorder(id: string, front: boolean): void {
    const ann = this.find(id)
    if (!ann) return
    const rest = this.items.filter(a => a !== ann)
    const next = front ? [...rest, ann] : [ann, ...rest]
    if (next.every((a, i) => a === this.items[i])) return
    this.items = next
    this.changed()
  }

  private isLocked(ann: Annotation): boolean {
    return this.allLocked || !!ann.locked
  }

  // A text or callout being edited is the editor; other drawings stay painted under it.
  private underEditor(ann: Annotation): boolean {
    return this.editor?.ann === ann && !!TOOLS[ann.type].editsText
  }

  // --- Painting ---

  private env(view: PrimitiveView): DrawEnv {
    return {
      pane: view.pane,
      dpr: view.dpr,
      theme: this.chart.getOptions().theme,
      barWidth: this.chart.timeScale().barWidth,
      formatPrice: price => this.chart.formatPrice(price),
    }
  }

  /** Map a visible annotation's points to CSS px, or null when it can't be drawn. */
  private resolve(ann: Annotation): Resolved | null {
    if (ann.hidden) return null
    const px: Px[] = []
    for (const p of ann.points) {
      const x = this.chart.timeToCoordinate(p.time)
      if (x === null) return null
      px.push({ x, y: this.chart.priceToCoordinate(p.price) })
    }
    const r: Resolved = {
      ann,
      px,
      style: resolveStyle(ann, this.chart.getOptions().theme),
    }
    if (ann.type === 'regression') r.fit = this.fit(ann)
    return r
  }

  /** A regression's fitted line in CSS px. */
  private fit(ann: Annotation): Resolved['fit'] {
    const series = this.chart.getSeries()
    if (!series) return null
    const { store } = series
    const [p, q] = ann.points as [AnnotationPoint, AnnotationPoint]
    const from = Math.min(p.time, q.time)
    const to = Math.max(p.time, q.time)
    const last = store.size ? store.closes[store.physical(store.lastIndex)] : 0
    const key = `${from} ${to} ${store.firstIndex} ${store.size} ${last}`
    let entry = this.fits.get(ann)
    if (entry?.key !== key) {
      entry = { key, fit: fitCloses(series.bars({ from, to })) }
      this.fits.set(ann, entry)
    }
    const { fit } = entry
    if (!fit) return null
    const x0 = this.chart.timeToCoordinate(fit.from)
    const x1 = this.chart.timeToCoordinate(fit.to)
    if (x0 === null || x1 === null) return null
    const y0 = this.chart.priceToCoordinate(fit.start)
    return {
      a: { x: x0, y: y0 },
      b: { x: x1, y: this.chart.priceToCoordinate(fit.end) },
      band: y0 - this.chart.priceToCoordinate(fit.start + 2 * fit.deviation),
    }
  }

  private paint(
    ctx: CanvasRenderingContext2D,
    env: DrawEnv,
    ann: Annotation,
  ): Resolved | null {
    const r = this.resolve(ann)
    if (r) drawAnnotation(ctx, r, env)
    return r
  }

  private draw(ctx: CanvasRenderingContext2D, view: PrimitiveView): void {
    if (!this.shown) return
    const env = this.env(view)
    ctx.save()
    clip(ctx, view.pane)
    for (const ann of this.items) {
      if (ann.id === this.selectedId || this.underEditor(ann)) continue
      this.paint(ctx, env, ann)
    }
    ctx.restore()
  }

  private drawOverlay(
    ctx: CanvasRenderingContext2D,
    view: PrimitiveView,
  ): void {
    if (!this.shown) return
    const env = this.env(view)
    const selected = this.selectedId ? this.find(this.selectedId) : undefined
    ctx.save()
    clip(ctx, view.pane)
    if (selected && !this.underEditor(selected)) {
      const r = this.paint(ctx, env, selected)
      if (r) this.paintSelection(ctx, r, env)
    }
    if (this.draft) {
      const { ann, placed } = this.draft
      this.paint(ctx, { ...env, previewPoints: placed + 1 }, ann)
    }
    ctx.restore()
    for (const ann of this.items) {
      if (!ann.hidden && TOOLS[ann.type].badge)
        this.paintPriceBadge(ctx, ann, env)
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
    if (!this.isLocked(r.ann)) {
      for (const h of this.handlePoints(r, env.pane)) {
        ctx.beginPath()
        ctx.arc(h.x, h.y, HANDLE_RADIUS, 0, Math.PI * 2)
        ctx.fill()
        ctx.stroke()
      }
    }
    const box = r.ann.type === 'text' ? labelBox(r.ann) : undefined
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
    return handlePositions(r).map(h => ({
      x: clamp(h.x, pane.left, pane.left + pane.width),
      y: clamp(h.y, pane.top, pane.top + pane.height),
    }))
  }

  // --- Interaction ---

  /** The drawing (and handle, on the selected one) under a point, topmost first. */
  private hitTest(
    p: Px,
  ): { ann: Annotation; handle?: readonly [number, number] } | null {
    if (!this.shown) return null
    const selected = this.selectedId ? this.find(this.selectedId) : undefined
    if (selected) {
      const r = this.resolve(selected)
      if (r) {
        if (!this.isLocked(selected)) {
          const handles = this.handlePoints(r, this.chart.paneLayout().main)
          const i = handles.findIndex(
            h => Math.hypot(p.x - h.x, p.y - h.y) <= HANDLE_RADIUS + 3,
          )
          if (i !== -1) {
            return { ann: selected, handle: TOOLS[selected.type].handles[i]! }
          }
        }
        if (hitAnnotation(r, p)) return { ann: selected }
      }
    }
    for (let i = this.items.length - 1; i >= 0; i--) {
      const ann = this.items[i]!
      const r = this.resolve(ann)
      if (r && hitAnnotation(r, p)) return { ann }
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

    const draft = this.draft
    if (draft) {
      const n = draft.ann.points.length
      for (let i = draft.placed; i < n; i++) draft.ann.points[i] = { ...point }
      draft.placed++
      if (draft.placed < n) {
        this.handle.redraw('overlay')
        return this.claim(e)
      }
      this.commitDraft()
      return this.editor ? this.claimForEditor(e) : this.claim(e)
    }

    if (this.activeTool) return this.startDrawing(this.activeTool, e, point)

    const hit = this.hitTest(e.point)
    if (!hit) {
      this.select(null)
      return false
    }
    this.select(hit.ann.id)
    if (this.selectedId !== hit.ann.id) return false
    if (this.isLocked(hit.ann)) return this.claim(e)
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

  private startDrawing(
    tool: AnnotationType,
    e: ChartPointerEvent,
    point: AnnotationPoint,
  ): true {
    const spec = TOOLS[tool]
    const { style, shape } = this.preset ?? {}
    const make = (points: AnnotationPoint[]) =>
      build({ type: tool, points, style, shape })

    if (spec.freehand) {
      const p = this.freePoint(e.point)
      if (p) {
        this.draft = { ann: make([p]), placed: 1, down: e.point, last: e.point }
      }
      return this.claim(e)
    }
    if (spec.place) {
      const barWidth = this.chart.timeScale().barWidth
      const points = spec
        .place(e.point, { barWidth })
        .map(px => this.toPoint(px) ?? point)
      this.finish(make(points))
      return this.claim(e)
    }
    const ann = make(Array.from({ length: spec.points }, () => ({ ...point })))
    if (spec.points > 1) {
      this.draft = { ann, placed: 1, down: e.point, last: e.point }
      this.handle.redraw('overlay')
      return this.claim(e)
    }
    this.finish(ann)
    return this.editor ? this.claimForEditor(e) : this.claim(e)
  }

  /** Take the press: focus the chart for keys, and keep the browser from selecting text. */
  private claim(e: ChartPointerEvent): true {
    e.source.preventDefault()
    this.chart.element.focus({ preventScroll: true })
    return true
  }

  /** Take the press but leave focus in the text editor it just opened. */
  private claimForEditor(e: ChartPointerEvent): true {
    e.source.preventDefault()
    return true
  }

  /** The data point at a pixel, unsnapped: between bars and off the magnet. */
  private freePoint(p: Px): AnnotationPoint | null {
    const time = this.chart.coordinateToTime(p.x, false)
    return time === null
      ? null
      : { time, price: this.chart.coordinateToPrice(p.y) }
  }

  /** The data point at a pixel, on the nearest bar's time. */
  private toPoint(p: Px): AnnotationPoint | null {
    const time = this.chart.coordinateToTime(p.x)
    return time === null
      ? null
      : { time, price: this.chart.coordinateToPrice(p.y) }
  }

  /** Points moved by whole bars (nearest to `dx` px) and exactly `dy` px in price. */
  private shifted(
    points: readonly AnnotationPoint[],
    dx: number,
    dy: number,
  ): AnnotationPoint[] {
    const { chart } = this
    const barWidth = chart.timeScale().barWidth
    const bars = Math.round(dx / barWidth)
    const dPrice = chart.coordinateToPrice(dy) - chart.coordinateToPrice(0)
    return points.map(p => {
      const x = bars === 0 ? null : chart.timeToCoordinate(p.time)
      const time =
        x === null
          ? p.time
          : (chart.coordinateToTime(x + bars * barWidth, false) ?? p.time)
      return { time, price: p.price + dPrice }
    })
  }

  private pointerMove(e: ChartPointerEvent, dragging: boolean): void {
    const draft = this.draft
    if (draft) {
      if (TOOLS[draft.ann.type].freehand) {
        const { last } = draft
        if (!dragging) return
        if (Math.hypot(e.point.x - last.x, e.point.y - last.y) < FREEHAND_STEP)
          return
        const p = this.freePoint(e.point)
        if (!p) return
        draft.ann.points.push(p)
        draft.last = e.point
      } else {
        if (e.time === null) return
        const { points } = draft.ann
        for (let i = draft.placed; i < points.length; i++) {
          points[i] = { time: e.time, price: e.price }
        }
      }
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
      drag.ann.points = this.shifted(
        drag.orig,
        e.point.x - drag.from.x,
        e.point.y - drag.from.y,
      )
    }
    drag.moved = true
    this.handle.redraw('overlay')
  }

  private pointerUp(e: ChartPointerEvent): void {
    const draft = this.draft
    if (draft) {
      const spec = TOOLS[draft.ann.type]
      if (spec.freehand) {
        if (draft.ann.points.length >= spec.points) this.commitDraft()
        else {
          this.draft = null
          this.handle.redraw('overlay')
        }
        return
      }
      // A drag from the first press places the second point at its release.
      const { down } = draft
      if (
        draft.placed === 1 &&
        Math.hypot(e.point.x - down.x, e.point.y - down.y) > CLICK_SLOP
      ) {
        if (e.time !== null) {
          const { points } = draft.ann
          for (let i = 1; i < points.length; i++) {
            points[i] = { time: e.time, price: e.price }
          }
        }
        draft.placed = 2
        if (draft.placed >= spec.points) this.commitDraft()
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
    this.finish(ann)
  }

  /**
   * Add a just-drawn drawing and select it, then return to the cursor unless
   * the tool is sticky. A text or callout opens its editor instead of
   * committing; the edit commits it.
   */
  private finish(ann: Annotation): void {
    this.items.push(ann)
    if (!this.sticky) {
      this.setTool(null)
      this.select(ann.id)
    }
    if (TOOLS[ann.type].editsText) this.openEditor(ann, true)
    else this.changed()
  }

  private cursor(e: ChartPointerEvent): string | null {
    if (this.activeTool || this.draft) return 'crosshair'
    if (this.drag) return 'grabbing'
    return e.inMainPane && this.hitTest(e.point) ? 'pointer' : null
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    if (e.target !== this.chart.element) return
    const key = e.key.toLowerCase()
    if ((e.ctrlKey || e.metaKey) && key === 'z') {
      if (e.shiftKey) this.redo()
      else this.undo()
    } else if (e.ctrlKey && key === 'y') {
      this.redo()
    } else if (e.key === 'Escape') {
      // A no-op Escape must not preventDefault, or the browser can't use it
      // to leave fullscreen.
      if (this.draft || this.activeTool) this.setTool(null)
      else if (this.selectedId) this.select(null)
      else return
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
    if (hit && TOOLS[hit.ann.type].editsText) this.openEditor(hit.ann, false)
  }

  /**
   * Edit a drawing's text in place, over its label. Enter or clicking away
   * commits, Shift+Enter starts a new line, Escape reverts. A text or
   * callout left empty is removed; any other drawing loses its caption.
   */
  private openEditor(ann: Annotation, isNew: boolean): void {
    this.closeEditor()
    const r = this.resolve(ann)
    if (!r) return
    const { theme } = this.chart.getOptions()
    const { style } = r
    const lh = style.fontSize * LINE_HEIGHT
    const pad = 3
    const box = labelBox(ann)
    const last = r.px[r.px.length - 1]!
    const at = box
      ? box.a
      : ann.type === 'text'
        ? { x: last.x, y: last.y - lh / 2 }
        : { x: last.x + 8, y: last.y - lh - 8 }
    const boxed = ann.type === 'callout'
    const input = document.createElement('textarea')
    input.value = ann.text ?? ''
    input.rows = 1
    input.setAttribute('aria-label', 'Drawing text')
    Object.assign(input.style, {
      position: 'absolute',
      zIndex: '3',
      left: `${at.x - pad}px`,
      top: `${at.y - pad}px`,
      minWidth: '10em',
      margin: '0',
      padding: `${pad - 1}px`,
      border: `1px solid ${style.color}`,
      borderRadius: '2px',
      outline: 'none',
      resize: 'none',
      overflow: 'hidden',
      whiteSpace: 'pre',
      background: boxed ? (style.fill ?? style.color) : theme.background,
      color: style.textColor,
      font: style.font,
      lineHeight: `${lh}px`,
    })
    const fit = () => {
      input.style.width = '0'
      input.style.height = '0'
      input.style.width = `${input.scrollWidth + 2}px`
      input.style.height = `${Math.max(input.scrollHeight, lh) + 2 * pad}px`
    }

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
      } else if (commit && TOOLS[ann.type].editsText) {
        this.remove(ann.id)
      } else if (commit && ann.text !== undefined) {
        delete ann.text
        this.changed()
      } else {
        this.handle.redraw()
      }
      this.chart.element.focus({ preventScroll: true })
    }
    input.addEventListener('keydown', e => {
      e.stopPropagation()
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        finish(true)
      } else if (e.key === 'Escape') finish(false)
    })
    input.addEventListener('input', fit)
    input.addEventListener('blur', () => finish(true))
    // Keep the chart from panning or re-opening the editor under the input.
    input.addEventListener('pointerdown', e => e.stopPropagation())
    input.addEventListener('dblclick', e => e.stopPropagation())

    this.editor = { ann, finish }
    this.handle.redraw()
    this.chart.element.append(input)
    fit()
    input.focus()
    input.select()
  }

  /** Commit any open text edit. */
  private closeEditor(): void {
    this.editor?.finish(true)
  }
}

function applyPatch(ann: Annotation, patch: AnnotationPatch): Annotation {
  // A patch from JSON can't change the identity, type, or group of a drawing.
  const [next] = createAll(
    [
      {
        ...ann,
        ...patch,
        id: ann.id,
        type: ann.type,
        group: ann.group,
        style: { ...ann.style, ...patch.style },
      },
    ],
    [],
  )
  return next!
}

/**
 * Validate and build drawings, ids unique among themselves and `existing`,
 * tagged with `group` when given. Throws with every problem, prefixed by the
 * input's position in a batch.
 */
function createAll(
  inputs: readonly AnnotationInput[],
  existing: readonly Annotation[],
  group?: string,
): Annotation[] {
  if (!Array.isArray(inputs)) {
    throw new Error('lightfin: annotations must be an array')
  }
  const taken = new Set(existing.map(a => a.id))
  const errors: string[] = []
  inputs.forEach((input, i) => {
    const problems = validateAnnotation(input)
    const id = (input as { id?: unknown } | null)?.id
    if (typeof id === 'string') {
      if (taken.has(id)) problems.push(`id "${id}" is already in use`)
      taken.add(id)
    }
    const at = inputs.length > 1 ? `[${i}] ` : ''
    errors.push(...problems.map(p => at + p))
  })
  if (errors.length > 0) {
    throw new Error(`lightfin: invalid annotation: ${errors.join('; ')}`)
  }
  return inputs.map(input =>
    build(group === undefined ? input : { ...input, group }),
  )
}

/** A drawing from an already-valid input. */
function build(input: AnnotationInput): Annotation {
  const ann: Annotation = {
    id: input.id ?? nextId(),
    type: input.type,
    points: input.points.map(p => ({ time: p.time, price: p.price })),
    style: stripUndefined(input.style ?? {}),
  }
  if (input.text !== undefined) ann.text = input.text
  if (input.shape !== undefined) ann.shape = input.shape
  if (input.locked) ann.locked = true
  if (input.hidden) ann.hidden = true
  if (input.hiddenLevels?.length) ann.hiddenLevels = [...input.hiddenLevels]
  if (input.group !== undefined) ann.group = input.group
  return ann
}

/** A copy without its `undefined` fields (objects only; anything else as is). */
function stripUndefined<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return value
  }
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(value)) {
    if (v !== undefined) out[k] = v
  }
  return out as T
}

function copy(ann: Annotation): Annotation {
  return {
    ...ann,
    points: ann.points.map(p => ({ ...p })),
    style: { ...ann.style },
    ...(ann.hiddenLevels && { hiddenLevels: [...ann.hiddenLevels] }),
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

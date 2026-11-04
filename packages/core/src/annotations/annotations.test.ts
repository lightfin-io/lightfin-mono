// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'

import type { Chart } from '../chart/chart'
import { DEFAULT_THEME } from '../chart/options'
import type { ChartPointerEvent, ChartPrimitive } from '../chart/primitive'
import type { Bar } from '../data/types'
import { Series } from '../series/series'
import { Annotations } from './annotations'
import { distToSegment, fitCloses } from './geometry'
import { formatDuration } from './measure'
import {
  TOOLS,
  drawAnnotation,
  handlePositions,
  hitAnnotation,
  resolveStyle,
} from './tools'
import type { Annotation } from './types'
import { validateAnnotation } from './validate'

/**
 * A stand-in for the chart's coordinate API: 1-minute bars 10px apart
 * (x = time / 6) and 10px per price unit (y = 1000 - price * 10).
 */
function setup(bars: Bar[] = []) {
  const element = document.createElement('div')
  document.body.append(element)
  let primitive: ChartPrimitive | null = null
  const series = new Series()
  series.setData(bars)
  const chart = {
    element,
    getSeries: () => series,
    attachPrimitive(p: ChartPrimitive) {
      primitive = p
      return { redraw: () => {}, detach: () => (primitive = null) }
    },
    timeToCoordinate: (t: number) => t / 6,
    coordinateToTime: (x: number) => Math.round(x / 10) * 60,
    priceToCoordinate: (p: number) => 1000 - p * 10,
    coordinateToPrice: (y: number) => (1000 - y) / 10,
    timeScale: () => ({ barWidth: 10 }),
    paneLayout: () => ({
      main: { left: 0, top: 0, width: 2000, height: 1000 },
      panes: [],
    }),
    getOptions: () => ({ theme: DEFAULT_THEME, priceAxisWidth: 64 }),
    formatPrice: (p: number) => p.toFixed(2),
  }
  const drawings = new Annotations(chart as unknown as Chart)
  const changes = vi.fn()
  drawings.on('change', changes)
  const p = () => primitive!
  return {
    element,
    drawings,
    changes,
    down: (x: number, y: number) => p().pointerDown!(pointer(x, y)),
    move: (x: number, y: number, dragging = true) =>
      p().pointerMove!(pointer(x, y), dragging),
    up: (x: number, y: number) => p().pointerUp!(pointer(x, y)),
    cursor: (x: number, y: number) => p().cursor!(pointer(x, y)),
    detached: () => primitive === null,
  }
}

function pointer(x: number, y: number): ChartPointerEvent {
  return {
    point: { x, y },
    time: Math.round(x / 10) * 60,
    price: (1000 - y) / 10,
    inMainPane: y <= 1000,
    source: { preventDefault() {} } as PointerEvent,
  }
}

const trendline = (
  points: [number, number, number, number],
): Omit<Annotation, 'id' | 'style'> => ({
  type: 'trendline',
  points: [
    { time: points[0], price: points[1] },
    { time: points[2], price: points[3] },
  ],
})

describe('Annotations', () => {
  it('draws a two-point tool by dragging, then returns to the cursor', () => {
    const t = setup()
    t.drawings.setTool('trendline')
    expect(t.cursor(0, 0)).toBe('crosshair')
    expect(t.down(100, 500)).toBe(true)
    t.move(200, 400)
    t.up(200, 400)

    const [line] = t.drawings.list()
    expect(line!.type).toBe('trendline')
    expect(line!.points).toEqual([
      { time: 600, price: 50 },
      { time: 1200, price: 60 },
    ])
    expect(t.drawings.tool).toBeNull()
    expect(t.drawings.selected).toBe(line!.id)
    expect(t.changes).toHaveBeenCalledTimes(1)
  })

  it('places the second point with a second click when the first press did not move', () => {
    const t = setup()
    t.drawings.setTool('rectangle')
    t.down(100, 500)
    t.up(100, 500)
    expect(t.drawings.list()).toHaveLength(0)
    t.move(300, 300, false) // hover preview
    t.down(300, 300)
    t.up(300, 300)
    expect(t.drawings.list()[0]!.points[1]).toEqual({ time: 1800, price: 70 })
    expect(t.changes).toHaveBeenCalledTimes(1)
  })

  it('places one-point tools on a single press', () => {
    const t = setup()
    t.drawings.setTool('hline')
    t.down(100, 450)
    expect(t.drawings.list()[0]).toMatchObject({
      type: 'hline',
      points: [{ time: 600, price: 55 }],
    })
  })

  it('Escape cancels a drawing in progress', () => {
    const t = setup()
    t.drawings.setTool('fib')
    t.down(100, 500)
    t.up(100, 500)
    t.element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(t.drawings.tool).toBeNull()
    t.down(300, 300)
    expect(t.drawings.list()).toHaveLength(0)
  })

  it('drags a drawing by whole bars, free in price, emitting one change', () => {
    const t = setup()
    t.drawings.add(trendline([600, 50, 1200, 60]))
    t.changes.mockClear()
    // The line runs (100,500) → (200,400); grab its midpoint.
    expect(t.down(150, 450)).toBe(true)
    t.move(173, 440)
    t.move(174, 440)
    t.up(174, 440)
    expect(t.drawings.list()[0]!.points).toEqual([
      { time: 600 + 120, price: 51 },
      { time: 1200 + 120, price: 61 },
    ])
    expect(t.changes).toHaveBeenCalledTimes(1)
  })

  it("drags only one point by the selected drawing's handle", () => {
    const t = setup()
    const id = t.drawings.add(trendline([600, 50, 1200, 60]))
    t.drawings.select(id)
    t.down(201, 401) // the second point's handle
    t.move(300, 300)
    t.up(300, 300)
    expect(t.drawings.get(id)!.points).toEqual([
      { time: 600, price: 50 },
      { time: 1800, price: 70 },
    ])
  })

  it('deselects on a press over empty space and lets it pan', () => {
    const t = setup()
    const id = t.drawings.add(trendline([600, 50, 1200, 60]))
    t.drawings.select(id)
    expect(t.cursor(150, 450)).toBe('pointer')
    expect(t.down(900, 100)).toBe(false)
    expect(t.drawings.selected).toBeNull()

    // A press in an indicator sub-pane deselects too.
    t.drawings.select(id)
    expect(t.down(150, 1100)).toBe(false)
    expect(t.drawings.selected).toBeNull()
  })

  it('Delete removes the selected drawing', () => {
    const t = setup()
    const id = t.drawings.add(trendline([600, 50, 1200, 60]))
    t.drawings.select(id)
    t.element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete' }))
    expect(t.drawings.list()).toHaveLength(0)
    expect(t.drawings.selected).toBeNull()
  })

  it('edits a new text label in place, dropping it when left empty', () => {
    const t = setup()
    t.drawings.setTool('text')
    t.down(100, 500)
    const input = t.element.querySelector('textarea')!
    input.value = 'Breakout'
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
    expect(t.drawings.list()[0]).toMatchObject({
      type: 'text',
      text: 'Breakout',
    })
    expect(t.element.querySelector('textarea')).toBeNull()

    t.drawings.setTool('text')
    t.down(300, 300)
    t.element
      .querySelector('textarea')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(t.drawings.list()).toHaveLength(1)
    expect(t.changes).toHaveBeenCalledTimes(1)
  })

  it('round-trips through JSON and validates point counts', () => {
    const t = setup()
    t.drawings.add({
      ...trendline([600, 50, 1200, 60]),
      style: { color: 'red' },
    })
    t.drawings.add({ type: 'vline', points: [{ time: 60, price: 1 }] })
    const json = JSON.parse(JSON.stringify(t.drawings.toJSON()))

    const u = setup()
    u.drawings.load(json)
    expect(u.drawings.list()).toEqual(json)
    expect(u.changes).not.toHaveBeenCalled()
    expect(() =>
      u.drawings.add({ type: 'fib', points: [{ time: 0, price: 1 }] }),
    ).toThrow(/2 point/)
  })

  it("replaces one group's drawings in a single change, leaving the rest", () => {
    const t = setup()
    const mine = t.drawings.add(trendline([600, 50, 1200, 60]))
    t.drawings.replace('ai', [
      { type: 'hline', points: [{ time: 60, price: 40 }], text: 'Support' },
    ])
    const old = t.drawings.list('ai')[0]!.id
    t.drawings.select(old)
    t.changes.mockClear()

    const ids = t.drawings.replace('ai', [
      { id: 'r1', type: 'hline', points: [{ time: 60, price: 70 }] },
      {
        type: 'marker',
        shape: 'arrowUp',
        points: [{ time: 120, price: 45 }],
      },
    ])
    expect(t.changes).toHaveBeenCalledTimes(1)
    expect(ids[0]).toBe('r1')
    expect(t.drawings.list('ai').map(a => a.id)).toEqual(ids)
    expect(t.drawings.list('ai').every(a => a.group === 'ai')).toBe(true)
    expect(t.drawings.get(mine)).not.toBeNull()
    expect(t.drawings.selected).toBeNull()

    t.drawings.clear('ai')
    expect(t.drawings.list().map(a => a.id)).toEqual([mine])
  })

  it('rejects a malformed batch whole, naming each problem by position', () => {
    const t = setup()
    t.drawings.replace('ai', [
      { type: 'vline', points: [{ time: 60, price: 1 }] },
    ])
    const before = t.drawings.list()
    expect(() =>
      t.drawings.replace('ai', [
        { type: 'hline', points: [{ time: 60, price: 1 }] },
        { type: 'hline', points: [{ time: 60, price: NaN }] },
        { type: 'circle' as 'marker', points: [] },
      ]),
    ).toThrow(
      /\[1\] points\[0\]\.price must be a finite number; \[2\] type must be one of/,
    )
    expect(t.drawings.list()).toEqual(before)
  })

  it('keeps ids unique', () => {
    const t = setup()
    t.drawings.add({ ...trendline([0, 1, 60, 2]), id: 'a' })
    expect(() =>
      t.drawings.add({ ...trendline([0, 1, 60, 2]), id: 'a' }),
    ).toThrow(/id "a" is already in use/)
    expect(() =>
      t.drawings.load([
        { ...trendline([0, 1, 60, 2]), id: 'b' },
        { ...trendline([0, 1, 60, 2]), id: 'b' },
      ]),
    ).toThrow(/\[1\] id "b"/)
    // Replacing a group may reuse its own ids, not another's.
    t.drawings.replace('ai', [{ ...trendline([0, 1, 60, 2]), id: 'c' }])
    t.drawings.replace('ai', [{ ...trendline([0, 1, 60, 2]), id: 'c' }])
    expect(() =>
      t.drawings.replace('ai', [{ ...trendline([0, 1, 60, 2]), id: 'a' }]),
    ).toThrow(/already in use/)
  })

  it('validates updates, which cannot retarget a drawing', () => {
    const t = setup()
    const id = t.drawings.add(trendline([600, 50, 1200, 60]))
    t.drawings.update(id, { text: 'Uptrend', style: { color: 'lime' } })
    expect(t.drawings.get(id)).toMatchObject({
      text: 'Uptrend',
      style: { color: 'lime' },
    })
    expect(() => t.drawings.update(id, { style: { lineWidth: -1 } })).toThrow(
      /style\.lineWidth/,
    )
    t.drawings.update(id, { type: 'hline', group: 'x' } as never)
    expect(t.drawings.get(id)).toMatchObject({ type: 'trendline' })
    expect(t.drawings.get(id)!.group).toBeUndefined()
  })

  it('returns copies, so callers cannot mutate drawings behind its back', () => {
    const t = setup()
    const id = t.drawings.add(trendline([600, 50, 1200, 60]))
    t.drawings.get(id)!.points[0]!.price = 999
    expect(t.drawings.get(id)!.points[0]!.price).toBe(50)
  })

  it('detaches from the chart on dispose', () => {
    const t = setup()
    t.drawings.dispose()
    expect(t.detached()).toBe(true)
    expect(t.element.hasAttribute('tabindex')).toBe(false)
  })
})

const key = (el: HTMLElement, init: KeyboardEventInit) =>
  el.dispatchEvent(new KeyboardEvent('keydown', init))

describe('Annotations: placing tools', () => {
  it('places a three-point tool by a drag, then a click', () => {
    const t = setup()
    t.drawings.setTool('channel')
    t.down(100, 500)
    t.move(200, 400)
    t.up(200, 400)
    expect(t.drawings.list()).toHaveLength(0)
    t.move(150, 300, false)
    t.down(150, 300)
    t.up(150, 300)
    expect(t.drawings.list()[0]).toMatchObject({
      type: 'channel',
      points: [
        { time: 600, price: 50 },
        { time: 1200, price: 60 },
        { time: 900, price: 70 },
      ],
    })
    expect(t.changes).toHaveBeenCalledTimes(1)
  })

  it('places a three-point tool by three clicks', () => {
    const t = setup()
    t.drawings.setTool('triangle')
    for (const [x, y] of [
      [100, 500],
      [200, 400],
      [300, 500],
    ] as const) {
      t.down(x, y)
      t.up(x, y)
    }
    expect(t.drawings.list()[0]!.points).toEqual([
      { time: 600, price: 50 },
      { time: 1200, price: 60 },
      { time: 1800, price: 50 },
    ])
  })

  it('places a position with one click, target twice as far as the stop', () => {
    const t = setup()
    t.drawings.setTool('longPosition')
    t.down(100, 500)
    t.up(100, 500)
    expect(t.drawings.list()[0]!.points).toEqual([
      { time: 600, price: 50 },
      { time: 1320, price: 58 },
      { time: 600, price: 46 },
    ])
    t.drawings.setTool('shortPosition')
    t.down(100, 500)
    expect(t.drawings.list()[1]!.points.map(p => p.price)).toEqual([50, 42, 54])
  })

  it('records a brush stroke along a drag, and draws nothing on a click', () => {
    const t = setup()
    t.drawings.setTool('brush')
    t.down(100, 500)
    t.move(101, 500) // under the sampling step
    t.move(110, 500)
    t.move(120, 505)
    t.up(120, 505)
    const [stroke] = t.drawings.list()
    expect(stroke!.type).toBe('brush')
    expect(stroke!.points).toHaveLength(3)

    t.drawings.setTool('brush')
    t.down(300, 300)
    t.up(300, 300)
    expect(t.drawings.list()).toHaveLength(1)
    expect(t.drawings.tool).toBe('brush')
  })

  it('starts drawings from the tool preset', () => {
    const t = setup()
    const ray = { style: { extend: 'end' as const } }
    t.drawings.setTool('trendline', ray)
    expect(t.drawings.toolPreset).toBe(ray)
    t.down(100, 500)
    t.up(200, 400)
    const [line] = t.drawings.list()
    expect(line!.style).toEqual({ extend: 'end' })
    t.drawings.select(null)
    // Past the second point, along the ray.
    expect(t.cursor(300, 300)).toBe('pointer')

    t.drawings.setTool('marker', { shape: 'flag' })
    t.down(400, 400)
    expect(t.drawings.list()[1]).toMatchObject({ shape: 'flag', style: {} })
  })

  it('keeps a sticky tool armed and leaves the new drawings unselected', () => {
    const t = setup()
    t.drawings.setStickyTool(true)
    t.drawings.setTool('hline')
    t.down(100, 400)
    t.down(100, 450)
    expect(t.drawings.list()).toHaveLength(2)
    expect(t.drawings.tool).toBe('hline')
    expect(t.drawings.selected).toBeNull()
    key(t.element, { key: 'Escape' })
    expect(t.drawings.tool).toBeNull()
  })

  it('opens a callout for its text once placed, dropping it when left empty', () => {
    const t = setup()
    t.drawings.setTool('callout')
    t.down(100, 500)
    t.up(200, 400)
    const input = t.element.querySelector('textarea')!
    input.value = 'Breakout\nconfirmed'
    key(input, { key: 'Enter' })
    expect(t.drawings.list()[0]).toMatchObject({
      type: 'callout',
      text: 'Breakout\nconfirmed',
    })
    expect(t.changes).toHaveBeenCalledTimes(1)

    t.drawings.setTool('callout')
    t.down(300, 300)
    t.up(300, 300)
    t.down(400, 300)
    key(t.element.querySelector('textarea')!, { key: 'Escape' })
    expect(t.drawings.list()).toHaveLength(1)
    expect(t.changes).toHaveBeenCalledTimes(1)
  })
})

describe('Annotations: editing', () => {
  it('undoes and redoes changes, by API and keyboard', () => {
    const t = setup()
    const id = t.drawings.add(trendline([600, 50, 1200, 60]))
    t.drawings.update(id, { style: { color: 'red' } })
    t.drawings.remove(id)
    expect(t.drawings.canUndo).toBe(true)

    expect(t.drawings.undo()).toBe(true)
    expect(t.drawings.get(id)!.style).toEqual({ color: 'red' })
    key(t.element, { key: 'z', ctrlKey: true })
    expect(t.drawings.get(id)!.style).toEqual({})
    key(t.element, { key: 'Z', metaKey: true, shiftKey: true })
    expect(t.drawings.get(id)!.style).toEqual({ color: 'red' })
    expect(t.drawings.redo()).toBe(true)
    expect(t.drawings.list()).toHaveLength(0)
    expect(t.drawings.redo()).toBe(false)

    t.drawings.undo()
    t.drawings.undo()
    t.drawings.undo()
    expect(t.drawings.list()).toHaveLength(0)
    expect(t.drawings.canUndo).toBe(false)
    expect(t.drawings.canRedo).toBe(true)

    // A new change drops the redo steps; loading starts over.
    t.drawings.add(trendline([0, 1, 60, 2]))
    expect(t.drawings.canRedo).toBe(false)
    t.drawings.load([])
    expect(t.drawings.canUndo).toBe(false)
  })

  it('clones a drawing beside the original, selected and on top', () => {
    const t = setup()
    const id = t.drawings.add({
      ...trendline([600, 50, 1200, 60]),
      group: 'ai',
      locked: true,
      text: 'Trend',
    })
    const twin = t.drawings.clone(id)!
    expect(t.drawings.selected).toBe(twin)
    const copy = t.drawings.list().at(-1)!
    expect(copy).toMatchObject({ id: twin, text: 'Trend', type: 'trendline' })
    expect(copy.group).toBeUndefined()
    expect(copy.locked).toBeUndefined()
    // 16px: two bars right (10px each, rounded), 1.6 lower in price.
    expect(copy.points[0]!.time).toBe(720)
    expect(copy.points[0]!.price).toBeCloseTo(48.4)
  })

  it('reorders drawings front and back', () => {
    const t = setup()
    const a = t.drawings.add(trendline([0, 1, 60, 2]))
    const b = t.drawings.add(trendline([0, 1, 60, 2]))
    t.drawings.sendToBack(b)
    expect(t.drawings.list().map(x => x.id)).toEqual([b, a])
    t.drawings.bringToFront(b)
    expect(t.drawings.list().map(x => x.id)).toEqual([a, b])
  })

  it('selects a locked drawing without moving it', () => {
    const t = setup()
    const id = t.drawings.add({
      ...trendline([600, 50, 1200, 60]),
      locked: true,
    })
    t.changes.mockClear()
    expect(t.down(150, 450)).toBe(true)
    t.move(250, 350)
    t.up(250, 350)
    expect(t.drawings.selected).toBe(id)
    expect(t.drawings.get(id)!.points[0]).toEqual({ time: 600, price: 50 })

    t.drawings.update(id, { locked: false })
    t.drawings.setLocked(true)
    t.down(150, 450)
    t.move(250, 350)
    t.up(250, 350)
    expect(t.drawings.get(id)!.points[0]).toEqual({ time: 600, price: 50 })
    expect(t.changes).toHaveBeenCalledTimes(1)
  })

  it('hides every drawing, and shows them again when a tool is armed', () => {
    const t = setup()
    const id = t.drawings.add(trendline([600, 50, 1200, 60]))
    t.drawings.select(id)
    t.drawings.setVisible(false)
    expect(t.drawings.selected).toBeNull()
    expect(t.down(150, 450)).toBe(false)
    t.drawings.setTool('hline')
    expect(t.drawings.visible).toBe(true)
  })

  it('reverts a style field to its default when patched with undefined', () => {
    const t = setup()
    const id = t.drawings.add({
      ...trendline([600, 50, 1200, 60]),
      style: { color: 'red', lineWidth: 3 },
      text: 'x',
    })
    t.drawings.update(id, { style: { color: undefined }, text: undefined })
    const ann = t.drawings.get(id)!
    expect(ann.style).toEqual({ lineWidth: 3 })
    expect('text' in ann).toBe(false)
  })

  it("edits any drawing's caption in place", () => {
    const t = setup()
    const id = t.drawings.add(trendline([600, 50, 1200, 60]))
    t.drawings.editText(id)
    const input = t.element.querySelector('textarea')!
    input.value = 'Uptrend'
    key(input, { key: 'Enter' })
    expect(t.drawings.get(id)!.text).toBe('Uptrend')

    t.drawings.editText(id)
    t.element.querySelector('textarea')!.value = ''
    key(t.element.querySelector('textarea')!, { key: 'Enter' })
    expect(t.drawings.get(id)).not.toBeNull()
    expect(t.drawings.get(id)!.text).toBeUndefined()
  })

  it('reports the style a drawing paints with, defaults filled in', () => {
    const t = setup()
    const box = t.drawings.add({
      type: 'rectangle',
      points: [
        { time: 0, price: 1 },
        { time: 60, price: 2 },
      ],
    })
    expect(t.drawings.effectiveStyle(box)).toMatchObject({
      color: DEFAULT_THEME.lineColor,
      lineWidth: 1,
      fillColor: `${DEFAULT_THEME.lineColor}26`,
      bold: false,
    })
    const label = t.drawings.add({
      type: 'text',
      points: [{ time: 0, price: 1 }],
      text: 'x',
    })
    expect(t.drawings.effectiveStyle(label)!.fillColor).toBeUndefined()
    expect(t.drawings.effectiveStyle('nope')).toBeNull()
  })

  it('fits a regression to the closes in its range and grabs it on the line', () => {
    // Closes rise 1 per bar from 50 at t=600: the fit is exact.
    const bars = Array.from({ length: 20 }, (_, i) => ({
      time: 600 + i * 60,
      open: 50 + i,
      high: 50 + i,
      low: 50 + i,
      close: 50 + i,
    }))
    const t = setup(bars)
    // The points' prices don't matter, only their times.
    t.drawings.add({
      type: 'regression',
      points: [
        { time: 600, price: 0 },
        { time: 1200, price: 0 },
      ],
    })
    // The fit runs (100,500) → (200,400).
    expect(t.cursor(150, 450)).toBe('pointer')
    expect(t.cursor(150, 300)).toBeNull()
  })
})

describe('validateAnnotation', () => {
  it('checks the newer fields and point counts', () => {
    expect(
      validateAnnotation({
        type: 'brush',
        points: [{ time: 60, price: 1 }],
        locked: 'yes',
        style: { extend: 'left', bold: 1, fontFamily: '', textColor: 3 },
      }),
    ).toEqual([
      'a brush annotation takes at least 2 points, got 1',
      'locked must be a boolean',
      'style.textColor must be a CSS color string',
      'style.fontFamily must be a non-empty CSS font family',
      'style.bold must be a boolean',
      'style.extend must be one of "none", "start", "end", "both"',
    ])
    expect(
      validateAnnotation({
        type: 'longPosition',
        points: [
          { time: 60, price: 1 },
          { time: 120, price: 2 },
        ],
      }),
    ).toEqual(['a longPosition annotation takes 3 point(s), got 2'])
  })

  it('accepts a well-formed annotation', () => {
    expect(
      validateAnnotation({
        id: 'x',
        type: 'marker',
        shape: 'arrowDown',
        points: [{ time: 1_700_000_000, price: 101.5 }],
        text: 'Top',
        group: 'ai',
        style: { color: '#f00', lineStyle: 'dashed', fontSize: 12 },
      }),
    ).toEqual([])
  })

  it('names each problem so a model can fix its input', () => {
    expect(validateAnnotation(null)).toEqual([
      'an annotation must be an object',
    ])
    expect(
      validateAnnotation({
        type: 'trendline',
        points: [{ time: 1_700_000_000_000, price: '5' }],
        label: 'x',
        shape: 'star',
        style: { lineStyle: 'wavy', width: 2 },
      }),
    ).toEqual([
      'unknown field "label"',
      'a trendline annotation takes 2 point(s), got 1',
      'points[0].time looks like milliseconds; use Unix seconds',
      'points[0].price must be a finite number',
      'shape must be one of "arrowUp", "arrowDown", "circle", "flag"',
      'unknown field "style.width"',
      'style.lineStyle must be one of "solid", "dashed", "dotted"',
    ])
  })

  it('does not mistake inherited object keys for a type', () => {
    expect(validateAnnotation({ type: 'constructor', points: [] })[0]).toMatch(
      /^type must be one of/,
    )
  })
})

describe('tool hit-testing', () => {
  const resolved = (
    type: Annotation['type'],
    px: { x: number; y: number }[],
  ) => {
    const ann: Annotation = {
      id: 'x',
      type,
      points: px.map(() => ({ time: 0, price: 0 })),
      style: {},
    }
    return { ann, px, style: resolveStyle(ann, DEFAULT_THEME) }
  }

  it('measures distance to a segment, clamped to its ends', () => {
    expect(distToSegment({ x: 5, y: 3 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(
      3,
    )
    expect(
      distToSegment({ x: 14, y: 3 }, { x: 0, y: 0 }, { x: 10, y: 0 }),
    ).toBe(5)
  })

  it('grabs a rectangle anywhere inside it', () => {
    const r = resolved('rectangle', [
      { x: 0, y: 0 },
      { x: 100, y: 50 },
    ])
    expect(TOOLS.rectangle.hit(r, { x: 50, y: 25 })).toBe(true)
    expect(TOOLS.rectangle.hit(r, { x: 150, y: 25 })).toBe(false)
  })

  it('grabs a marker by its shape: an up arrow below its point, a down arrow above', () => {
    const at = [{ x: 100, y: 100 }]
    const up = resolved('marker', at)
    up.ann.shape = 'arrowUp'
    expect(TOOLS.marker.hit(up, { x: 100, y: 112 })).toBe(true)
    expect(TOOLS.marker.hit(up, { x: 100, y: 88 })).toBe(false)
    const down = resolved('marker', at)
    down.ann.shape = 'arrowDown'
    expect(TOOLS.marker.hit(down, { x: 100, y: 88 })).toBe(true)
    expect(TOOLS.marker.hit(down, { x: 100, y: 112 })).toBe(false)
  })

  it('colors arrows with the theme up/down colors unless styled', () => {
    const ann = (shape: Annotation['shape'], color?: string): Annotation => ({
      id: 'x',
      type: 'marker',
      points: [{ time: 0, price: 0 }],
      style: color ? { color } : {},
      shape,
    })
    expect(resolveStyle(ann('arrowUp'), DEFAULT_THEME).color).toBe(
      DEFAULT_THEME.upColor,
    )
    expect(resolveStyle(ann('arrowDown'), DEFAULT_THEME).color).toBe(
      DEFAULT_THEME.downColor,
    )
    expect(resolveStyle(ann('arrowDown', 'gold'), DEFAULT_THEME).color).toBe(
      'gold',
    )
  })

  it('grabs a drawing by its caption, where it was last painted', () => {
    // 6px per character; any other canvas call is a no-op.
    const ctx = new Proxy(
      {
        measureText: (s: string) => ({ width: s.length * 6 }),
      } as unknown as CanvasRenderingContext2D,
      {
        get: (target, key) =>
          key in target ? target[key as keyof typeof target] : () => {},
        set: () => true,
      },
    )
    const env = {
      pane: { left: 0, top: 0, width: 500, height: 300 },
      dpr: 1,
      theme: DEFAULT_THEME,
      barWidth: 10,
      formatPrice: String,
    }
    const r = resolved('hline', [{ x: 50, y: 100 }])
    r.ann.text = 'Support'
    drawAnnotation(ctx, r, env)
    // Right-aligned at the pane's right edge, just above the line.
    expect(hitAnnotation(r, { x: 480, y: 90 })).toBe(true)
    expect(hitAnnotation(r, { x: 300, y: 80 })).toBe(false)

    r.ann.text = ''
    drawAnnotation(ctx, r, env)
    expect(hitAnnotation(r, { x: 480, y: 90 })).toBe(false)
  })

  it('grabs fib levels within their span, not between them', () => {
    // From (0,100) up to (100,0): the 0.5 level sits at y = 50.
    const r = resolved('fib', [
      { x: 0, y: 100 },
      { x: 100, y: 0 },
    ])
    expect(TOOLS.fib.hit(r, { x: 80, y: 52 })).toBe(true)
    // Midway between the 0.236 (y 23.6) and 0.382 (y 38.2) levels.
    expect(TOOLS.fib.hit(r, { x: 80, y: 31 })).toBe(false)
    expect(TOOLS.fib.hit(r, { x: 140, y: 50 })).toBe(false)
  })

  it('grabs a channel on either line or between them', () => {
    // Base (0,100) → (100,50); its parallel 40px lower, through (50,115).
    const r = resolved('channel', [
      { x: 0, y: 100 },
      { x: 100, y: 50 },
      { x: 50, y: 115 },
    ])
    expect(TOOLS.channel.hit(r, { x: 50, y: 75 })).toBe(true)
    expect(TOOLS.channel.hit(r, { x: 100, y: 90 })).toBe(true)
    expect(TOOLS.channel.hit(r, { x: 50, y: 95 })).toBe(true)
    expect(TOOLS.channel.hit(r, { x: 50, y: 130 })).toBe(false)
    expect(TOOLS.channel.hit(r, { x: 150, y: 40 })).toBe(false)
  })

  it('grabs a horizontal ray only from its point rightwards', () => {
    const r = resolved('hray', [{ x: 100, y: 50 }])
    expect(TOOLS.hray.hit(r, { x: 400, y: 52 })).toBe(true)
    expect(TOOLS.hray.hit(r, { x: 50, y: 50 })).toBe(false)
  })

  it('grabs an ellipse inside its outline, not in the box corners', () => {
    const r = resolved('ellipse', [
      { x: 0, y: 0 },
      { x: 100, y: 50 },
    ])
    expect(TOOLS.ellipse.hit(r, { x: 50, y: 25 })).toBe(true)
    expect(TOOLS.ellipse.hit(r, { x: 2, y: 2 })).toBe(false)
  })

  it("puts a position's stop handle on its right edge at the stop", () => {
    const r = resolved('longPosition', [
      { x: 0, y: 100 },
      { x: 120, y: 20 },
      { x: 0, y: 140 },
    ])
    expect(handlePositions(r)).toEqual([
      { x: 0, y: 100 },
      { x: 120, y: 20 },
      { x: 120, y: 140 },
    ])
    expect(TOOLS.longPosition.hit(r, { x: 60, y: 130 })).toBe(true)
    expect(TOOLS.longPosition.hit(r, { x: 60, y: 160 })).toBe(false)
  })

  it('fits closes by least squares', () => {
    const fit = fitCloses([
      { time: 0, close: 1 },
      { time: 60, close: 3 },
      { time: 120, close: 2 },
    ])!
    expect(fit.from).toBe(0)
    expect(fit.to).toBe(120)
    expect(fit.start).toBeCloseTo(1.5)
    expect(fit.end).toBeCloseTo(2.5)
    // Residuals −0.5, 1, −0.5.
    expect(fit.deviation).toBeCloseTo(Math.SQRT1_2)
    expect(fitCloses([{ time: 0, close: 1 }])).toBeNull()
  })

  it('formats durations in their two largest units', () => {
    expect(formatDuration(45)).toBe('45s')
    expect(formatDuration(2 * 3600 + 15 * 60 + 9)).toBe('2h 15m')
    expect(formatDuration(3 * 86_400 + 60)).toBe('3d')
    expect(formatDuration(-90)).toBe('1m 30s')
    expect(formatDuration(0)).toBe('0s')
  })
})

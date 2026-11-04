// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'

import type { Chart } from '../chart/chart'
import { DEFAULT_THEME } from '../chart/options'
import type { ChartPointerEvent, ChartPrimitive } from '../chart/primitive'
import { Annotations } from './annotations'
import { distToSegment } from './geometry'
import { TOOLS, drawAnnotation, hitAnnotation, resolveStyle } from './tools'
import type { Annotation } from './types'

/**
 * A stand-in for the chart's coordinate API: 1-minute bars 10px apart
 * (x = time / 6) and 10px per price unit (y = 1000 - price * 10).
 */
function setup() {
  const element = document.createElement('div')
  document.body.append(element)
  let primitive: ChartPrimitive | null = null
  const chart = {
    element,
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
    const input = t.element.querySelector('input')!
    input.value = 'Breakout'
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
    expect(t.drawings.list()[0]).toMatchObject({
      type: 'text',
      text: 'Breakout',
    })
    expect(t.element.querySelector('input')).toBeNull()

    t.drawings.setTool('text')
    t.down(300, 300)
    t.element
      .querySelector('input')!
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
})

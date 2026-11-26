// @vitest-environment jsdom
import { expect, it } from 'vitest'

import { Annotations } from '../annotations'
import type { Chart } from '../chart/chart'
import { DEFAULT_THEME } from '../chart/options'
import type { DrawingToolHotkeys } from './drawingTools'
import { createLeftToolbar } from './drawingTools'
import { createChrome } from './index'

function drawingChart() {
  const host = document.createElement('div')
  const element = document.createElement('div')
  host.append(element)
  document.body.append(host)
  const chart = {
    element,
    attachPrimitive: () => ({ redraw() {}, detach() {} }),
    crosshairMode: () => 'normal',
    getOptions: () => ({ theme: DEFAULT_THEME }),
    getSeries: () => undefined,
    on: () => () => {},
  } as unknown as Chart
  const annotations = new Annotations(chart, { persistence: false })
  return { chart, annotations, host }
}

it('keeps undo and redo buttons in sync with drawing history', () => {
  const { chart, annotations, host } = drawingChart()
  const toolbar = createLeftToolbar(chart, annotations, host, new Map())
  host.append(toolbar.el)
  const undo = host.querySelector<HTMLButtonElement>('[aria-label="Undo"]')!
  const redo = host.querySelector<HTMLButtonElement>('[aria-label="Redo"]')!

  expect(undo.disabled).toBe(true)
  expect(redo.disabled).toBe(true)
  annotations.add({ type: 'hline', points: [{ time: 60, price: 10 }] })
  expect(undo.disabled).toBe(false)
  undo.click()
  expect(annotations.list()).toHaveLength(0)
  expect(undo.disabled).toBe(true)
  expect(redo.disabled).toBe(false)
  redo.click()
  expect(annotations.list()).toHaveLength(1)
  expect(redo.disabled).toBe(true)
  annotations.undo()
  annotations.add({ type: 'hline', points: [{ time: 120, price: 20 }] })
  expect(redo.disabled).toBe(true)

  toolbar.dispose()
  annotations.dispose()
  host.remove()
})

it('applies hotkey overrides, clears replaced labels, and removes the listener on dispose', () => {
  const { chart, annotations, host } = drawingChart()
  const chrome = createChrome(chart, {
    annotations,
    hud: false,
    topToolbar: false,
    bottomToolbar: false,
    persistence: false,
    hotkeys: { trendline: ['l'], hline: null, ray: ['Option', 'v'] },
  })
  const press = (init: KeyboardEventInit, target = chart.element) =>
    target.dispatchEvent(
      new KeyboardEvent('keydown', {
        bubbles: true,
        cancelable: true,
        ...init,
      }),
    )
  const input = chart.element.appendChild(document.createElement('input'))

  try {
    expect(
      host
        .querySelector('[title="Trend line (L)"]')
        ?.getAttribute('aria-keyshortcuts'),
    ).toBe('L')
    expect(press({ key: 'l' }, input)).toBe(true)
    expect(press({ key: 't', altKey: true })).toBe(true)
    expect(press({ key: 'h', altKey: true })).toBe(true)
    expect(annotations.tool).toBeNull()

    expect(press({ key: 'l' })).toBe(false)
    expect(annotations.tool).toBe('trendline')
    expect(annotations.toolPreset?.style).toEqual({})
    // Option+V on macOS can report a symbol and the physical letter key.
    expect(press({ key: '√', code: 'KeyV', altKey: true })).toBe(false)
    expect(annotations.toolPreset?.style).toEqual({ extend: 'end' })
    expect(
      host.querySelector('[title="Ray (Alt+V)"]')?.getAttribute('aria-pressed'),
    ).toBe('true')

    host.querySelector<HTMLButtonElement>('[title="More lines"]')!.click()
    expect(
      host
        .querySelector('[role="menuitem"][aria-keyshortcuts="Alt+V"]')
        ?.textContent?.trim(),
    ).toBe('Ray (Alt+V)')
    expect(
      Array.from(host.querySelectorAll('[role="menuitem"]'), b =>
        b.textContent?.trim(),
      ),
    ).toContain('Vertical line')
  } finally {
    chrome.dispose()
    annotations.dispose()
    host.remove()
  }
  expect(press({ key: 'l', repeat: true })).toBe(true)
})

it('omits malformed hotkeys from the drawing toolbar', () => {
  const { chart, annotations, host } = drawingChart()
  const hotkeys = {
    trendline: [],
    ray: ['Alt', 'Option', 'J'],
    hline: ['UnknownModifier', 'H'],
    hray: 'Alt+J',
    vline: ['Alt+V'],
    crossline: ['Option'],
  } as unknown as DrawingToolHotkeys
  const toolbar = createLeftToolbar(
    chart,
    annotations,
    host,
    new Map(),
    hotkeys,
  )
  host.append(toolbar.el)

  try {
    host.querySelector<HTMLButtonElement>('[title="More lines"]')!.click()
    expect(
      host.querySelectorAll('[role="menuitem"][aria-keyshortcuts]'),
    ).toHaveLength(0)
  } finally {
    toolbar.dispose()
    annotations.dispose()
    host.remove()
  }
})

// @vitest-environment jsdom
import { expect, it } from 'vitest'

import { Annotations } from '../annotations'
import type { Chart } from '../chart/chart'
import { createLeftToolbar } from './drawingTools'

it('keeps undo and redo buttons in sync with drawing history', () => {
  const host = document.createElement('div')
  const element = document.createElement('div')
  host.append(element)
  document.body.append(host)
  const chart = {
    element,
    attachPrimitive: () => ({ redraw() {}, detach() {} }),
    crosshairMode: () => 'normal',
  } as unknown as Chart
  const annotations = new Annotations(chart)
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

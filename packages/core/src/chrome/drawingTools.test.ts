// @vitest-environment jsdom
import { expect, it, vi } from 'vitest'

import { Annotations } from '../annotations'
import type { Chart } from '../chart/chart'
import { createLeftToolbar } from './drawingTools'
import { createDrawingBackupButton } from './modals'

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

it('allows retry after an async backup failure and blocks overlapping actions', async () => {
  const host = document.createElement('div')
  document.body.append(host)
  let reject!: (reason: Error) => void
  const save = vi.fn(
    () =>
      new Promise<void>((_, fail) => {
        reject = fail
      }),
  )
  const restore = vi.fn()
  const control = createDrawingBackupButton(host, { save, restore })
  host.append(control.el)
  control.el.click()

  const buttons = host.querySelectorAll<HTMLButtonElement>('.lf-actions button')
  const saveButton = buttons[1]!
  const restoreButton = buttons[2]!
  const status = host.querySelector('[role="status"]')!
  saveButton.click()
  saveButton.click()
  restoreButton.click()
  expect(status.textContent).toBe('Saving backup…')
  expect(save).toHaveBeenCalledTimes(1)
  expect(restore).not.toHaveBeenCalled()

  reject(new Error('Storage unavailable'))
  await Promise.resolve()
  expect(status.textContent).toBe('Storage unavailable')
  restoreButton.click()
  await Promise.resolve()
  expect(status.textContent).toBe('Drawing backup restored.')
  expect(restore).toHaveBeenCalledOnce()

  control.dispose()
  expect(host.querySelector('[role="dialog"]')).toBeNull()
  host.remove()
})

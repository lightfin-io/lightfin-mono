// @vitest-environment jsdom
import { expect, it, vi } from 'vitest'

import { createResetSettingsButton } from './modals'

it('reports a failed host reset and allows retry after it settles', async () => {
  const host = document.createElement('div')
  document.body.append(host)
  let reject!: (error: Error) => void
  const resetChart = vi.fn(() => {})
  resetChart.mockImplementationOnce(
    () => new Promise<void>((_, fail) => (reject = fail)),
  )
  const resetDrawings = vi.fn()
  const control = createResetSettingsButton(host, [
    { label: 'Reset chart options', run: resetChart, success: 'Chart reset.' },
    {
      label: 'Reset drawing-tool defaults',
      run: resetDrawings,
      success: 'Tools reset.',
    },
  ])!
  host.append(control.el)
  control.el.click()
  const [chart, drawings] = host.querySelectorAll<HTMLButtonElement>(
    '.lf-reset-actions button',
  )
  const status = host.querySelector('[role="status"]')!
  chart!.click()
  chart!.click()
  drawings!.click()
  expect(chart!.getAttribute('aria-disabled')).toBe('true')
  expect(resetChart).toHaveBeenCalledOnce()
  expect(resetDrawings).not.toHaveBeenCalled()

  reject(new Error('Storage unavailable'))
  await Promise.resolve()
  expect(status.textContent).toBe('Storage unavailable')
  chart!.click()
  await Promise.resolve()
  expect(status.textContent).toBe('Chart reset.')
  expect(resetChart).toHaveBeenCalledTimes(2)

  control.dispose()
  expect(host.querySelector('[role="dialog"]')).toBeNull()
  host.remove()
})

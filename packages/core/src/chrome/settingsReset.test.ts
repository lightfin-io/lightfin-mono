// @vitest-environment jsdom
import { expect, it, vi } from 'vitest'

import type { Chart, ChartEventMap } from '../chart/chart'
import { Emitter } from '../chart/events'
import type { CrosshairMode } from '../chart/options'
import { DEFAULT_THEME } from '../chart/options'
import { Series } from '../series/series'
import type { SettingsPersistence } from './index'
import { createChrome } from './index'
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
  expect(status.textContent).toBe('✓ Chart reset.')
  expect(resetChart).toHaveBeenCalledTimes(2)

  control.dispose()
  expect(host.querySelector('[role="dialog"]')).toBeNull()
  host.remove()
})

it('restores and saves settings through an async adapter without using browser storage', async () => {
  const host = document.createElement('div')
  const root = document.createElement('div')
  host.append(root)
  document.body.append(host)
  const events = new Emitter<ChartEventMap>()
  const series = new Series()
  series.onChange = change => events.emit('dataChange', change)
  let mode: CrosshairMode = 'normal'
  const chart = {
    element: root,
    getOptions: () => ({ theme: DEFAULT_THEME }),
    getSeries: () => series,
    crosshairMode: () => mode,
    setCrosshairMode(next: CrosshairMode) {
      mode = next
      events.emit('crosshairModeChange', mode)
    },
    on: events.on.bind(events),
  } as unknown as Chart
  const loadBrowser = vi.spyOn(Storage.prototype, 'getItem')
  const saveBrowser = vi.spyOn(Storage.prototype, 'setItem')
  const save = vi.fn<SettingsPersistence['save']>()
  const onIntervalChange = vi.fn()
  const chrome = createChrome(chart, {
    hud: false,
    topToolbar: false,
    bottomToolbar: false,
    interval: '1m',
    intervals: ['1m', '5m'],
    onIntervalChange,
    persistence: {
      async load() {
        return { interval: '5m', chartType: 'line', crosshairMode: 'magnet' }
      },
      save,
    },
  })
  try {
    await chrome.ready
    expect(chrome.interval()).toBe('5m')
    expect(onIntervalChange).toHaveBeenCalledExactlyOnceWith('5m')
    expect(series.chartType).toBe('line')
    expect(mode).toBe('magnet')
    expect(save).not.toHaveBeenCalled()

    chrome.setInterval('1m')
    expect(save).toHaveBeenCalledExactlyOnceWith({
      interval: '1m',
      chartType: 'line',
      crosshairMode: 'magnet',
    })
    expect(loadBrowser).not.toHaveBeenCalled()
    expect(saveBrowser).not.toHaveBeenCalled()
  } finally {
    chrome.dispose()
    host.remove()
    loadBrowser.mockRestore()
    saveBrowser.mockRestore()
  }
})

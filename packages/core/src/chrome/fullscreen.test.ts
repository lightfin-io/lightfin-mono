// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { Chart } from '../chart/chart'
import { DEFAULT_DATE_FORMATTERS, DEFAULT_THEME } from '../chart/options'
import { createChrome } from './index'

/**
 * jsdom has no Fullscreen API. These stand-ins record which element is
 * fullscreen and fire `fullscreenchange`, the same signal the button listens to.
 */
let fullscreen: Element | null = null

beforeEach(() => {
  fullscreen = null
  Object.defineProperty(document, 'fullscreenElement', {
    configurable: true,
    get: () => fullscreen,
  })
  document.exitFullscreen = () => {
    fullscreen = null
    document.dispatchEvent(new Event('fullscreenchange'))
    return Promise.resolve()
  }
})

afterEach(() => {
  document.body.replaceChildren()
})

function mount(withFullscreen = true) {
  const host = document.createElement('div')
  const root = document.createElement('div')
  host.append(root)
  document.body.append(host)
  if (withFullscreen) {
    host.requestFullscreen = () => {
      fullscreen = host
      document.dispatchEvent(new Event('fullscreenchange'))
      return Promise.resolve()
    }
  }
  const chart = {
    element: root,
    getOptions: () => ({ theme: DEFAULT_THEME }),
    instrument: () => null,
    dateFormatters: DEFAULT_DATE_FORMATTERS,
    on: () => () => {},
  } as unknown as Chart
  const chrome = createChrome(chart, {
    hud: false,
    topToolbar: false,
    ranges: [],
  })
  return { host, chrome }
}

function fullscreenButton(host: HTMLElement): HTMLButtonElement | null {
  return host.querySelector('.lf-toolbar-bottom button:last-of-type')
}

describe('fullscreen button', () => {
  it('sits to the right of the exchange clock', () => {
    const { host, chrome } = mount()
    const bar = host.querySelector('.lf-toolbar-bottom')!
    const clock = bar.querySelector('.lf-clock')!
    const button = fullscreenButton(host)!
    expect(button.getAttribute('aria-label')).toBe('Fullscreen')
    expect(clock.nextElementSibling).toBe(button)
    expect(button).toBe(bar.lastElementChild)
    chrome.dispose()
  })

  it('toggles the chart host and follows fullscreenchange, including Escape', () => {
    const { host, chrome } = mount()
    const button = fullscreenButton(host)!
    const enterIcon = button.innerHTML

    button.click()
    expect(document.fullscreenElement).toBe(host)
    expect(button.getAttribute('aria-pressed')).toBe('true')
    expect(button.getAttribute('aria-label')).toBe('Exit fullscreen')
    expect(button.innerHTML).not.toBe(enterIcon)

    // The browser exits on Escape without another click on the button.
    fullscreen = null
    document.dispatchEvent(new Event('fullscreenchange'))
    expect(button.getAttribute('aria-pressed')).toBe('false')
    expect(button.getAttribute('aria-label')).toBe('Fullscreen')
    expect(button.innerHTML).toBe(enterIcon)

    button.click()
    button.click()
    expect(document.fullscreenElement).toBeNull()
    expect(button.getAttribute('aria-label')).toBe('Fullscreen')
    chrome.dispose()
  })

  it('leaves fullscreen when the chrome is removed', () => {
    const { host, chrome } = mount()
    fullscreenButton(host)!.click()
    expect(document.fullscreenElement).toBe(host)
    chrome.dispose()
    expect(document.fullscreenElement).toBeNull()
    expect(host.querySelector('.lf-toolbar-bottom')).toBeNull()
    document.dispatchEvent(new Event('fullscreenchange'))
  })

  it('omits the button when the Fullscreen API is missing', () => {
    const { host, chrome } = mount(false)
    const bar = host.querySelector('.lf-toolbar-bottom')!
    expect(bar.querySelector('.lf-clock')!.nextElementSibling).toBeNull()
    expect(bar.querySelector('[aria-label="Fullscreen"]')).toBeNull()
    chrome.dispose()
  })
})

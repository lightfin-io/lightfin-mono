// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'

import type { Chart } from '../chart/chart'
import { DEFAULT_DATE_FORMATTERS, DEFAULT_THEME } from '../chart/options'
import ema, * as emaModule from '../indicators/ema'
import type { IndicatorDefinition } from '../indicators/types'
import type { Chrome, ChromeOptions, IndicatorMenuItem } from './index'
import { BUILTIN_INDICATORS, builtinIndicators, createChrome } from './index'

/**
 * jsdom stand-in for the chart surface the toolbar touches. `added` records
 * every `addIndicator` call so a menu pick can be checked without a series.
 */
function fakeChart() {
  const host = document.createElement('div')
  const root = document.createElement('div')
  host.append(root)
  document.body.append(host)
  const added: { source: unknown; options: unknown }[] = []
  const chart = {
    element: root,
    getOptions: () => ({ theme: DEFAULT_THEME }),
    getSeries: () => null,
    crosshairMode: () => 'normal',
    instrument: () => null,
    dateFormatters: DEFAULT_DATE_FORMATTERS,
    on: () => () => {},
    addIndicator: (source: unknown, options?: unknown) => {
      added.push({ source, options })
      return Promise.resolve({})
    },
  } as unknown as Chart
  return { host, chart, added }
}

function stubIndicator(name: string): IndicatorDefinition {
  return {
    name,
    overlay: true,
    defaultOptions: {},
    plots: () => [],
    create: () => ({
      value: () => Number.NaN,
      calculateAll() {},
      updateLast() {},
    }),
  }
}

function mount(options: ChromeOptions = {}) {
  const ctx = fakeChart()
  const chrome = createChrome(ctx.chart, {
    hud: false,
    bottomToolbar: false,
    chartTypes: [],
    ...options,
  })
  return { ...ctx, chrome }
}

function indicatorsButton(host: HTMLElement): HTMLButtonElement {
  const button = host.querySelector<HTMLButtonElement>(
    '[aria-label="Indicators"]',
  )
  if (!button) throw new Error('indicators button missing')
  return button
}

/** Opens the menu. A second call leaves it open — the button toggles. */
function openMenu(host: HTMLElement): HTMLElement {
  const button = indicatorsButton(host)
  if (button.getAttribute('aria-expanded') !== 'true') button.click()
  const menu = host.querySelector<HTMLElement>('[role="menu"]')
  if (!menu) throw new Error('indicators menu missing')
  return menu
}

function closeMenu(host: HTMLElement): void {
  const button = indicatorsButton(host)
  if (button.getAttribute('aria-expanded') === 'true') button.click()
}

function menuLabels(host: HTMLElement): string[] {
  return [...openMenu(host).querySelectorAll('[role="menuitem"]')].map(
    item => item.textContent ?? '',
  )
}

function pickAt(host: HTMLElement, index: number): void {
  const items = [
    ...openMenu(host).querySelectorAll<HTMLButtonElement>('[role="menuitem"]'),
  ]
  const item = items[index]
  if (!item) throw new Error(`missing menu item ${index}`)
  item.click()
}

describe('indicators menu', () => {
  let chrome: Chrome | null = null

  afterEach(() => {
    chrome?.dispose()
    chrome = null
    document.body.replaceChildren()
  })

  it('lists every built-in, in order, when no list is passed', () => {
    expect(BUILTIN_INDICATORS[0]).toBe(builtinIndicators.sma)
    expect(BUILTIN_INDICATORS.at(-1)).toBe(builtinIndicators.volumeMa)
    const ctx = mount()
    chrome = ctx.chrome
    expect(menuLabels(ctx.host)).toEqual(
      BUILTIN_INDICATORS.map(entry => entry.name),
    )
  })

  it('keeps the built-ins and appends a custom indicator', () => {
    const custom = stubIndicator('Spread Oscillator')
    const ctx = mount({ indicators: [...BUILTIN_INDICATORS, custom] })
    chrome = ctx.chrome
    expect(menuLabels(ctx.host)).toEqual([
      ...BUILTIN_INDICATORS.map(entry => entry.name),
      'Spread Oscillator',
    ])
  })

  it('accepts a mix of lazy built-ins, imported indicators, and custom ones', async () => {
    const custom = stubIndicator('My Oscillator')
    const fromModule = stubIndicator('From Module')
    const moduleIndicator = { default: fromModule }
    const ctx = mount({
      indicators: [
        builtinIndicators.sma,
        builtinIndicators.rsi,
        ema,
        emaModule,
        custom,
        moduleIndicator,
        { name: 'Fast EMA', load: () => ema, options: { period: 8 } },
      ],
    })
    chrome = ctx.chrome

    expect(menuLabels(ctx.host)).toEqual([
      'Moving Average (SMA)',
      'Relative Strength Index (RSI)',
      'EMA',
      'EMA',
      'My Oscillator',
      'From Module',
      'Fast EMA',
    ])

    const menu = openMenu(ctx.host)
    const search = menu.querySelector('input')!
    search.value = 'osc'
    search.dispatchEvent(new Event('input'))
    const visible = [...menu.querySelectorAll<HTMLElement>('[role="menuitem"]')]
      .filter(item => !item.hidden)
      .map(item => item.textContent)
    expect(visible).toEqual(['My Oscillator'])
    expect(menu.querySelector<HTMLElement>('.lf-menu-empty')!.hidden).toBe(true)

    search.value = 'nope'
    search.dispatchEvent(new Event('input'))
    expect(menu.querySelector<HTMLElement>('.lf-menu-empty')!.hidden).toBe(
      false,
    )
    closeMenu(ctx.host)

    // Rows: lazy SMA, lazy RSI, imported EMA definition, EMA module namespace,
    // custom definition, custom module, catalog entry with preset options.
    pickAt(ctx.host, 0)
    await expect(ctx.added[0]!.source).resolves.toMatchObject({
      default: expect.objectContaining({ name: 'SMA' }),
    })
    expect(ctx.added[0]!.options).toBeUndefined()

    pickAt(ctx.host, 2)
    expect(ctx.added[1]!.source).toBe(ema)

    pickAt(ctx.host, 3)
    expect(ctx.added[2]!.source).toBe(emaModule)

    pickAt(ctx.host, 4)
    expect(ctx.added[3]!.source).toBe(custom)

    pickAt(ctx.host, 5)
    expect(ctx.added[4]!.source).toBe(moduleIndicator)

    pickAt(ctx.host, 6)
    expect(ctx.added[5]!.source).toBe(ema)
    expect(ctx.added[5]!.options).toEqual({ period: 8 })
  })

  it('hides the indicators button when the list is empty', () => {
    const ctx = mount({ indicators: [] })
    chrome = ctx.chrome
    expect(ctx.host.querySelector('[aria-label="Indicators"]')).toBeNull()
  })

  it('rejects an entry that is not an indicator', () => {
    const { chart } = fakeChart()
    expect(() =>
      createChrome(chart, {
        indicators: [{} as IndicatorMenuItem],
      }),
    ).toThrow(/catalog entry, definition, or module/)
    expect(document.getElementById('lightfin-chrome-styles')).toBeNull()
  })

  it('rejects a bare import() promise, which has no menu label yet', () => {
    const { chart } = fakeChart()
    expect(() =>
      createChrome(chart, {
        indicators: [
          import('../indicators/sma') as unknown as IndicatorMenuItem,
        ],
      }),
    ).toThrow(/cannot be a promise/)
  })
})

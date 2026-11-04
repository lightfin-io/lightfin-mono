import type { AnnotationType, Annotations } from '../annotations'
import type { Chart } from '../chart/chart'
import type { ChartType } from '../series/series'
import type { ICONS } from './dom'
import { button, el } from './dom'
import type { DateRangePreset } from './format'
import { dateRangeStart } from './format'
import { openGoToModal } from './modals'

/** Anything `chart.addIndicator` accepts: a module, definition, or a promise of one. */
export type IndicatorSource = Parameters<Chart['addIndicator']>[0]

/** One entry in the toolbar's indicators menu. */
export interface IndicatorCatalogEntry {
  /** Menu label, e.g. "Moving Average (SMA)". */
  name: string
  /** Loads the indicator, typically `() => import('…/indicators/sma')`. */
  load: () => IndicatorSource
  /** Options passed to `addIndicator` when picked from the menu. */
  options?: Record<string, unknown>
}

const CHART_TYPE_LABELS: Record<ChartType, string> = {
  candlestick: 'Candles',
  bar: 'Bars',
  line: 'Line',
  area: 'Area',
}

export interface TopToolbarContext {
  host: HTMLElement
  intervals: readonly string[]
  interval(): string | null
  selectInterval(interval: string): void
  chartTypes: readonly ChartType[]
  catalog: readonly IndicatorCatalogEntry[]
}

export interface Toolbar {
  el: HTMLElement
  /** Re-sync pressed states with the chart (interval, chart type). */
  sync(): void
  dispose(): void
}

/**
 * Top toolbar (PLAN §9): interval selector, chart-type selector, and the
 * indicators menu. Symbol search is left to the host.
 */
export function createTopToolbar(
  chart: Chart,
  ctx: TopToolbarContext,
): Toolbar {
  const bar = el('div', 'lf-toolbar lf-toolbar-top')
  bar.setAttribute('role', 'toolbar')
  bar.setAttribute('aria-label', 'Chart toolbar')
  const groups: HTMLElement[][] = []

  const intervalButtons = ctx.intervals.map(iv => {
    const b = button({ label: iv, title: `Interval ${iv}` }, () =>
      ctx.selectInterval(iv),
    )
    b.dataset.interval = iv
    return b
  })
  if (intervalButtons.length > 0) groups.push(intervalButtons)

  const typeButtons = ctx.chartTypes.map(type => {
    const b = button({ icon: type, title: CHART_TYPE_LABELS[type] }, () =>
      chart.getSeries()?.setChartType(type),
    )
    b.dataset.chartType = type
    return b
  })
  if (typeButtons.length > 0) groups.push(typeButtons)

  let menu: HTMLElement | null = null
  const closeMenu = () => {
    menu?.remove()
    menu = null
    indicatorsButton.setAttribute('aria-expanded', 'false')
    document.removeEventListener('pointerdown', onOutside, true)
    document.removeEventListener('keydown', onKey, true)
  }
  const onOutside = (e: PointerEvent) => {
    const t = e.target as Node
    if (!menu?.contains(t) && !indicatorsButton.contains(t)) closeMenu()
  }
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      closeMenu()
      indicatorsButton.focus()
    }
  }
  const openMenu = () => {
    menu = el('div', 'lf-menu')
    menu.setAttribute('role', 'menu')
    for (const entry of ctx.catalog) {
      const item = button({ label: entry.name }, () => {
        closeMenu()
        void chart.addIndicator(entry.load(), entry.options)
      })
      item.setAttribute('role', 'menuitem')
      menu.append(item)
    }
    const hostRect = ctx.host.getBoundingClientRect()
    const r = indicatorsButton.getBoundingClientRect()
    menu.style.left = `${r.left - hostRect.left}px`
    menu.style.top = `${r.bottom - hostRect.top + 4}px`
    ctx.host.append(menu)
    indicatorsButton.setAttribute('aria-expanded', 'true')
    menu.querySelector('button')?.focus()
    document.addEventListener('pointerdown', onOutside, true)
    document.addEventListener('keydown', onKey, true)
  }
  const indicatorsButton = button(
    { icon: 'indicators', label: 'Indicators', title: 'Indicators' },
    () => (menu ? closeMenu() : openMenu()),
  )
  indicatorsButton.setAttribute('aria-haspopup', 'menu')
  indicatorsButton.setAttribute('aria-expanded', 'false')
  if (ctx.catalog.length > 0) groups.push([indicatorsButton])

  groups.forEach((group, i) => {
    if (i > 0) bar.append(el('div', 'lf-sep'))
    bar.append(...group)
  })

  const sync = () => {
    const current = ctx.interval()
    for (const b of intervalButtons) {
      b.setAttribute('aria-pressed', String(b.dataset.interval === current))
    }
    const type = chart.getSeries()?.chartType
    for (const b of typeButtons) {
      b.setAttribute('aria-pressed', String(b.dataset.chartType === type))
    }
  }
  const offs = [
    chart.on('dataChange', change => {
      if (change === 'style') sync()
    }),
    chart.on('seriesChange', sync),
  ]
  sync()

  return {
    el: bar,
    sync,
    dispose: () => {
      closeMenu()
      for (const off of offs) off()
      bar.remove()
    },
  }
}

export interface BottomToolbarContext {
  host: HTMLElement
  ranges: readonly DateRangePreset[]
}

export interface BottomToolbar extends Toolbar {
  /** Advance the exchange clock; called once a second by the chrome. */
  tick(now: Date): void
}

/**
 * Bottom toolbar (PLAN §9): quick date ranges, the "Go to" date/range dialog,
 * and the exchange-local clock.
 */
export function createBottomToolbar(
  chart: Chart,
  ctx: BottomToolbarContext,
  formatClock: (now: Date) => string,
): BottomToolbar {
  const bar = el('div', 'lf-toolbar lf-toolbar-bottom')
  bar.setAttribute('role', 'toolbar')
  bar.setAttribute('aria-label', 'Date range')

  for (const preset of ctx.ranges) {
    bar.append(
      button({ label: preset, title: rangeTitle(preset) }, () =>
        showRange(chart, preset),
      ),
    )
  }
  if (ctx.ranges.length > 0) bar.append(el('div', 'lf-sep'))
  bar.append(
    button({ icon: 'calendar', title: 'Go to date' }, () =>
      openGoToModal(ctx.host, chart),
    ),
  )
  bar.append(el('div', 'lf-spacer'))
  const clock = el('span', 'lf-clock')
  clock.title = 'Exchange time'
  bar.append(clock)

  return {
    el: bar,
    sync: () => {},
    tick: now => {
      clock.textContent = formatClock(now)
    },
    dispose: () => bar.remove(),
  }
}

const DRAWING_TOOLS: {
  tool: AnnotationType | null
  icon: keyof typeof ICONS
  title: string
}[] = [
  { tool: null, icon: 'cursor', title: 'Cursor' },
  { tool: 'trendline', icon: 'trendline', title: 'Trend line' },
  { tool: 'hline', icon: 'hline', title: 'Horizontal line' },
  { tool: 'vline', icon: 'vline', title: 'Vertical line' },
  { tool: 'rectangle', icon: 'rectangle', title: 'Rectangle' },
  { tool: 'fib', icon: 'fib', title: 'Fib retracement' },
  { tool: 'text', icon: 'text', title: 'Text' },
]

/**
 * Left toolbar (PLAN §9): the drawing tools of an {@link Annotations}
 * instance, plus "remove all drawings". Picking the armed tool again disarms
 * it.
 */
export function createLeftToolbar(annotations: Annotations): Toolbar {
  const bar = el('div', 'lf-toolbar lf-toolbar-left')
  bar.setAttribute('role', 'toolbar')
  bar.setAttribute('aria-label', 'Drawing tools')
  bar.setAttribute('aria-orientation', 'vertical')

  const toolButtons = DRAWING_TOOLS.map(({ tool, icon, title }) => {
    const b = button({ icon, title }, () =>
      annotations.setTool(tool === annotations.tool ? null : tool),
    )
    b.dataset.tool = tool ?? ''
    return b
  })
  bar.append(
    ...toolButtons,
    el('div', 'lf-sep'),
    button({ icon: 'trash', title: 'Remove all drawings' }, () =>
      annotations.clear(),
    ),
  )

  const sync = () => {
    const current = annotations.tool ?? ''
    for (const b of toolButtons) {
      b.setAttribute('aria-pressed', String(b.dataset.tool === current))
    }
  }
  const off = annotations.on('toolChange', sync)
  sync()

  return {
    el: bar,
    sync,
    dispose: () => {
      off()
      bar.remove()
    },
  }
}

function showRange(chart: Chart, preset: DateRangePreset): void {
  const store = chart.getSeries()?.store
  if (!store || store.size === 0) return
  const end = store.times[store.physical(store.lastIndex)]!
  const from = dateRangeStart(preset, end, chart.instrument()?.timezone)
  if (from === null) chart.fitContent()
  else void chart.setVisibleTimeRange({ from, to: end })
}

function rangeTitle(preset: DateRangePreset): string {
  switch (preset) {
    case 'All':
      return 'All loaded data'
    case 'YTD':
      return 'Year to date'
    default: {
      const n = preset.slice(0, -1)
      const unit = { D: 'day', M: 'month', Y: 'year' }[preset.slice(-1)]!
      return `${n} ${unit}${n === '1' ? '' : 's'}`
    }
  }
}

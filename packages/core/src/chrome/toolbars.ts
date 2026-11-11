import type { Chart } from '../chart/chart'
import type { ChartType } from '../series/series'
import { ICONS, button, el, menuItem } from './dom'
import type { DateRangePreset } from './format'
import { dateRangeStart } from './format'
import { openGoToModal } from './modals'
import { popover } from './popover'

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

  const indicatorsButton = button(
    { icon: 'indicators', label: 'Indicators', title: 'Indicators' },
    () => menu.toggle(),
  )
  const menu = popover(
    indicatorsButton,
    ctx.host,
    close => buildIndicatorMenu(chart, ctx.catalog, close),
    { className: 'lf-menu-indicators', label: 'Indicators' },
  )
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
      menu.close()
      for (const off of offs) off()
      bar.remove()
    },
  }
}

/**
 * The indicators popover's contents: a search field (filtering the list by
 * name as you type) above the list of catalog entries. Rebuilt each time the
 * menu opens, so it always starts unfiltered.
 */
function buildIndicatorMenu(
  chart: Chart,
  catalog: readonly IndicatorCatalogEntry[],
  close: () => void,
): Node[] {
  const searchRow = el('div', 'lf-menu-search')
  searchRow.innerHTML = ICONS.search
  const search = el('input', 'lf-menu-search-input')
  search.type = 'search'
  search.placeholder = 'Search'
  search.setAttribute('aria-label', 'Search indicators')
  searchRow.append(search)

  const list = el('div', 'lf-menu-list')
  const items = catalog.map(entry => ({
    name: entry.name.toLowerCase(),
    node: menuItem({ label: entry.name }, () => {
      close()
      void chart.addIndicator(entry.load(), entry.options)
    }),
  }))
  for (const { node } of items) list.append(node)

  const empty = el('div', 'lf-menu-empty', 'No matching indicators')
  empty.hidden = true
  list.append(empty)

  const filter = () => {
    const q = search.value.trim().toLowerCase()
    let matches = 0
    for (const { name, node } of items) {
      const hit = name.includes(q)
      node.hidden = !hit
      if (hit) matches++
    }
    empty.hidden = matches > 0
  }
  search.addEventListener('input', filter)

  return [searchRow, list]
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
 * the exchange-local clock, and a fullscreen toggle for the chart host.
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

  // Browsers without the Fullscreen API (or that hide it) get no dead button.
  const fullscreen =
    typeof ctx.host.requestFullscreen === 'function'
      ? fullscreenButton(ctx.host)
      : null
  if (fullscreen) bar.append(fullscreen.el)

  return {
    el: bar,
    sync: () => {},
    tick: now => {
      clock.textContent = formatClock(now)
    },
    dispose: () => {
      fullscreen?.dispose()
      bar.remove()
    },
  }
}

/**
 * Toggle the chart host in and out of fullscreen. The icon follows
 * `fullscreenchange`, including Escape and other exits the button didn't start.
 */
function fullscreenButton(host: HTMLElement): {
  el: HTMLButtonElement
  dispose(): void
} {
  const b = button({ icon: 'fullscreen', title: 'Fullscreen' }, () =>
    toggleFullscreen(host),
  )
  const sync = () => {
    const on = document.fullscreenElement === host
    b.setAttribute('aria-pressed', String(on))
    b.title = on ? 'Exit fullscreen' : 'Fullscreen'
    b.setAttribute('aria-label', b.title)
    b.innerHTML = ICONS[on ? 'exitFullscreen' : 'fullscreen']
  }
  document.addEventListener('fullscreenchange', sync)
  sync()
  return {
    el: b,
    dispose: () => {
      document.removeEventListener('fullscreenchange', sync)
      if (document.fullscreenElement === host) {
        void document.exitFullscreen?.().catch(() => {})
      }
    },
  }
}

function toggleFullscreen(host: HTMLElement): void {
  const action =
    document.fullscreenElement === host
      ? document.exitFullscreen?.()
      : host.requestFullscreen()
  // A rejected request (no user gesture, or the frame disallows it) leaves
  // the button unchanged; fullscreenchange updates it when the mode really changes.
  void action?.catch(() => {})
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

import type { Chart } from '../chart/chart'
import type { ChartType } from '../series/series'
import { button, el, menuItem } from './dom'
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
  const menu = popover(indicatorsButton, ctx.host, close =>
    ctx.catalog.map(entry =>
      menuItem({ label: entry.name }, () => {
        close()
        void chart.addIndicator(entry.load(), entry.options)
      }),
    ),
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

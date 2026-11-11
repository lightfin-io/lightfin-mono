/**
 * @lightfin/core/chrome — optional DOM widgets around the chart (PLAN §9):
 * the top-left HUD/legend, the top toolbar (interval, chart type, indicators),
 * the bottom toolbar (date ranges, go-to dialog, exchange clock, fullscreen), and — given
 * an annotations instance — the left drawing-tools toolbar and the selected
 * drawing's style toolbar.
 *
 * Its own subpath export, so headless/embedded charts pay nothing for it and
 * hosts can build their own widgets on the same public chart API instead.
 *
 * ```ts
 * import { createChrome } from '@lightfin/core/chrome'
 * const chrome = createChrome(chart, {
 *   intervals: ['1m', '5m', '1H', '1D'],
 *   interval: '1m',
 *   onIntervalChange: iv => loadBars(iv),
 * })
 * ```
 */
import type { Annotations } from '../annotations'
import type { Chart } from '../chart/chart'
import type { ChartType } from '../series/series'
import { el } from './dom'
import { createDrawingToolbar } from './drawingToolbar'
import type { ToolStyles } from './drawingTools'
import { createLeftToolbar } from './drawingTools'
import type { DateRangePreset } from './format'
import { DATE_RANGE_PRESETS, formatClock } from './format'
import { Hud } from './hud'
import { acquireStyles, releaseStyles, themeVars } from './styles'
import type { IndicatorCatalogEntry, Toolbar } from './toolbars'
import { createBottomToolbar, createTopToolbar } from './toolbars'

export type { DateRangePreset } from './format'
export { DATE_RANGE_PRESETS } from './format'
export type { IndicatorCatalogEntry, IndicatorSource } from './toolbars'

/**
 * The built-in indicators for the toolbar menu. Each entry loads its module on
 * demand, so listing them costs nothing until one is picked.
 */
export const BUILTIN_INDICATORS: readonly IndicatorCatalogEntry[] = [
  { name: 'Moving Average (SMA)', load: () => import('../indicators/sma') },
  {
    name: 'Exponential Moving Average (EMA)',
    load: () => import('../indicators/ema'),
  },
  { name: 'Bollinger Bands', load: () => import('../indicators/bollinger') },
  {
    name: 'Relative Strength Index (RSI)',
    load: () => import('../indicators/rsi'),
  },
  { name: 'MACD', load: () => import('../indicators/macd') },
  {
    name: 'Average True Range (ATR)',
    load: () => import('../indicators/atr'),
  },
  {
    name: 'Stochastic Oscillator',
    load: () => import('../indicators/stochastic'),
  },
  { name: 'Volume MA', load: () => import('../indicators/volumeMa') },
]

export interface ChromeOptions {
  /** Top-left legend with OHLCV and indicator rows. Default true. */
  hud?: boolean
  /** Interval / chart type / indicators bar above the chart. Default true. */
  topToolbar?: boolean
  /** Date ranges / go-to / clock / fullscreen bar below the chart. Default true. */
  bottomToolbar?: boolean
  /**
   * Interval labels for the selector, e.g. `['1m', '5m', '1H', '1D']`. The
   * chart has no notion of interval — picking one calls
   * {@link onIntervalChange} and the host loads the matching bars. Omit to
   * hide the selector.
   */
  intervals?: readonly string[]
  /** The active interval, shown in the selector and the legend. */
  interval?: string
  onIntervalChange?: (interval: string) => void
  /** Chart types offered in the toolbar. Default: all four. */
  chartTypes?: readonly ChartType[]
  /** Indicators menu entries. Default {@link BUILTIN_INDICATORS}; `[]` hides it. */
  indicators?: readonly IndicatorCatalogEntry[]
  /** Quick ranges in the bottom toolbar. Default {@link DATE_RANGE_PRESETS}. */
  ranges?: readonly DateRangePreset[]
  /**
   * Drawing tools from `@lightfin/core/annotations`; shows the left
   * toolbar and, for the selected drawing, a floating style toolbar. Omit
   * to leave them out (and the annotations code unloaded).
   */
  annotations?: Annotations
}

export interface Chrome {
  /** Set the active interval (e.g. after the host switched it programmatically). */
  setInterval(interval: string | null): void
  /** Remove every widget and restore the container. */
  dispose(): void
}

/**
 * Mount the chrome around `chart`, inside the chart's container: toolbars
 * stack above/below the canvases (which shrink to fit) and the HUD overlays
 * the plot. Colors follow the chart theme.
 */
export function createChrome(
  chart: Chart,
  options: ChromeOptions = {},
): Chrome {
  const root = chart.element
  const host = root.parentElement
  if (!host) throw new Error('lightfin: chart element is not mounted')

  acquireStyles()
  const vars = themeVars(chart.getOptions().theme)
  const restoreHost = {
    position: host.style.position,
    vars: Object.keys(vars).map(k => [k, host.style.getPropertyValue(k)]),
  }
  for (const [k, v] of Object.entries(vars)) host.style.setProperty(k, v)
  if (getComputedStyle(host).position === 'static') {
    host.style.position = 'relative'
  }
  host.classList.add('lf-host')
  root.classList.add('lf-chart')

  let interval = options.interval ?? null
  const showBottom = options.bottomToolbar !== false
  const timeZone = () => chart.instrument()?.timezone

  const hud =
    options.hud === false
      ? null
      : new Hud(chart, {
          host,
          interval: () => interval,
          showClock: !showBottom,
        })

  const top =
    options.topToolbar === false
      ? null
      : createTopToolbar(chart, {
          host,
          intervals: options.intervals ?? [],
          interval: () => interval,
          selectInterval: iv => {
            if (iv === interval) return
            applyInterval(iv)
            options.onIntervalChange?.(iv)
          },
          chartTypes: options.chartTypes ?? [
            'candlestick',
            'bar',
            'line',
            'area',
          ],
          catalog: options.indicators ?? BUILTIN_INDICATORS,
        })

  // The left toolbar sits beside the chart, so the two share a row; the
  // selected drawing's style toolbar floats over the plot.
  const drawings = options.annotations
  const toolStyles: ToolStyles = new Map()
  const left = drawings
    ? createLeftToolbar(chart, drawings, host, toolStyles)
    : null
  const styleBar = drawings
    ? createDrawingToolbar(chart, drawings, host, toolStyles)
    : null
  const body = left ? el('div', 'lf-body') : null
  if (body) {
    root.replaceWith(body)
    body.append(left!.el, root)
  }
  const main = body ?? root
  if (top) host.insertBefore(top.el, main)

  const bottom = showBottom
    ? createBottomToolbar(
        chart,
        { host, ranges: options.ranges ?? DATE_RANGE_PRESETS },
        now => formatClock(now, timeZone(), chart.dateFormatters.timeWithSeconds),
      )
    : null
  if (bottom) main.after(bottom.el)

  // Tick the exchange clock on each wall-clock second.
  let clockTimer: ReturnType<typeof setTimeout> | undefined
  const tick = () => {
    const now = new Date()
    bottom?.tick(now)
    hud?.tick(now)
    clockTimer = setTimeout(tick, 1000 - (now.getTime() % 1000) + 5)
  }
  tick()
  const offInstrument = chart.on('instrumentChange', () => {
    const now = new Date()
    bottom?.tick(now)
  })

  function applyInterval(next: string | null): void {
    interval = next
    top?.sync()
    hud?.invalidate()
  }

  return {
    setInterval: applyInterval,
    dispose: () => {
      clearTimeout(clockTimer)
      offInstrument()
      hud?.dispose()
      styleBar?.dispose()
      for (const bar of [top, bottom, left] as (Toolbar | null)[]) {
        bar?.dispose()
      }
      body?.replaceWith(root)
      host
        .querySelectorAll(':scope > .lf-backdrop, :scope > .lf-menu')
        .forEach(n => n.remove())
      host.classList.remove('lf-host')
      root.classList.remove('lf-chart')
      host.style.position = restoreHost.position
      for (const [k, v] of restoreHost.vars) host.style.setProperty(k!, v!)
      releaseStyles()
    },
  }
}

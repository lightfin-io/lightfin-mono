/**
 * @lightfin/core/chrome — optional DOM widgets around the chart:
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
 *
 * The indicators menu lists {@link BUILTIN_INDICATORS} unless `indicators`
 * replaces it. Build that list from {@link builtinIndicators}, imported
 * indicator modules, and your own definitions.
 */
import type { Annotations } from '../annotations'
import type { Chart } from '../chart/chart'
import type { CrosshairMode } from '../chart/options'
import type { Persistence, PersistenceErrorHandler } from '../chart/persistence'
import {
  bindPersistence,
  chartStorageKey,
  localStoragePersistence,
} from '../chart/persistence'
import type { IndicatorDefinition, IndicatorModule } from '../indicators/types'
import type { ChartType } from '../series/series'
import { el } from './dom'
import { createDrawingToolbar } from './drawingToolbar'
import type { ToolStyles } from './drawingTools'
import { createLeftToolbar } from './drawingTools'
import type { DateRangePreset } from './format'
import { DATE_RANGE_PRESETS, formatClock } from './format'
import { Hud } from './hud'
import { acquireStyles, releaseStyles, themeVars } from './styles'
import type {
  IndicatorCatalogEntry,
  IndicatorSource,
  Toolbar,
} from './toolbars'
import { createBottomToolbar, createTopToolbar } from './toolbars'

export type { DateRangePreset } from './format'
export { DATE_RANGE_PRESETS } from './format'
export type { IndicatorCatalogEntry, IndicatorSource } from './toolbars'

function menuEntry(
  name: string,
  load: IndicatorCatalogEntry['load'],
): IndicatorCatalogEntry {
  return { name, load }
}

/**
 * Built-in indicators, keyed by id, for a custom menu. Each entry loads its
 * module when the user picks it, so listing `sma` does not download the rest.
 *
 * Mix these with an imported built-in (`import ema from
 * '@lightfin/core/indicators/ema'`) and your own indicator definitions. An
 * imported definition is labeled with its `name` ("EMA"); a built-in entry
 * keeps the longer menu label ("Exponential Moving Average (EMA)").
 *
 * ```ts
 * import { builtinIndicators } from '@lightfin/core/chrome'
 * import myOscillator from './myOscillator'
 *
 * createChrome(chart, {
 *   indicators: [builtinIndicators.sma, builtinIndicators.rsi, myOscillator],
 * })
 * ```
 */
export const builtinIndicators = {
  sma: menuEntry('Moving Average (SMA)', () => import('../indicators/sma')),
  ema: menuEntry(
    'Exponential Moving Average (EMA)',
    () => import('../indicators/ema'),
  ),
  wma: menuEntry(
    'Weighted Moving Average (WMA)',
    () => import('../indicators/wma'),
  ),
  bollinger: menuEntry(
    'Bollinger Bands',
    () => import('../indicators/bollinger'),
  ),
  keltner: menuEntry('Keltner Channels', () => import('../indicators/keltner')),
  vwap: menuEntry('VWAP', () => import('../indicators/vwap')),
  rsi: menuEntry(
    'Relative Strength Index (RSI)',
    () => import('../indicators/rsi'),
  ),
  macd: menuEntry('MACD', () => import('../indicators/macd')),
  stochastic: menuEntry(
    'Stochastic Oscillator',
    () => import('../indicators/stochastic'),
  ),
  williamsR: menuEntry('Williams %R', () => import('../indicators/williamsR')),
  cci: menuEntry(
    'Commodity Channel Index (CCI)',
    () => import('../indicators/cci'),
  ),
  roc: menuEntry('Rate of Change (ROC)', () => import('../indicators/roc')),
  adx: menuEntry(
    'Average Directional Index (ADX)',
    () => import('../indicators/adx'),
  ),
  atr: menuEntry('Average True Range (ATR)', () => import('../indicators/atr')),
  obv: menuEntry('On-Balance Volume (OBV)', () => import('../indicators/obv')),
  volumeMa: menuEntry('Volume MA', () => import('../indicators/volumeMa')),
}

/**
 * Every {@link builtinIndicators} entry, in menu order. This is the indicators
 * menu when `indicators` is omitted. Spread it to keep the full set and add
 * your own: `[...BUILTIN_INDICATORS, myOscillator]`.
 */
export const BUILTIN_INDICATORS: readonly IndicatorCatalogEntry[] =
  Object.values(builtinIndicators)

// Caller options stay opaque; the definition interprets them.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ListedIndicator = IndicatorDefinition<any> | IndicatorModule<any>

/**
 * One indicators-menu row. A {@link IndicatorCatalogEntry} loads on demand
 * (the built-ins). A definition or module — imported from
 * `@lightfin/core/indicators/*`, or one you wrote — is listed under its
 * `name`.
 */
export type IndicatorMenuItem = IndicatorCatalogEntry | ListedIndicator

/** Catalog entries pass through; definitions and modules take their `name`. */
function toCatalogEntry(item: IndicatorMenuItem): IndicatorCatalogEntry {
  if (
    typeof item === 'object' &&
    item !== null &&
    typeof (item as IndicatorCatalogEntry).load === 'function'
  ) {
    return item as IndicatorCatalogEntry
  }
  const name = indicatorName(item)
  if (name !== null) return { name, load: () => item as IndicatorSource }
  // addIndicator accepts a bare import(); the menu needs a name up front.
  const thenable = item as unknown as { then?: unknown } | null
  if (typeof thenable?.then === 'function') {
    throw new Error(
      'lightfin: an indicators menu entry cannot be a promise; use { name, load: () => import(...) } or pass the loaded definition',
    )
  }
  throw new Error(
    'lightfin: indicators menu entry must be a catalog entry, definition, or module',
  )
}

function indicatorName(item: IndicatorMenuItem): string | null {
  if (typeof item !== 'object' || item === null) return null
  const record = item as {
    name?: unknown
    create?: unknown
    default?: { name?: unknown; create?: unknown }
  }
  const embedded = record.default
  if (
    embedded &&
    typeof embedded.create === 'function' &&
    typeof embedded.name === 'string'
  ) {
    return embedded.name
  }
  if (typeof record.create === 'function' && typeof record.name === 'string') {
    return record.name
  }
  return null
}

export interface ChartSettings {
  interval: string | null
  chartType?: ChartType
  crosshairMode: CrosshairMode
}

/** Storage for the chart's interactive settings. Missing fields use the host's defaults. */
export type SettingsPersistence = Persistence<
  ChartSettings,
  Partial<ChartSettings>
>

const CHART_TYPES = ['candlestick', 'bar', 'line', 'area'] as const

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
  /** Load bars after the user selects an interval or a saved interval is restored. */
  onIntervalChange?: (interval: string) => void
  /** Chart types offered in the toolbar. Default: all four. */
  chartTypes?: readonly ChartType[]
  /**
   * Indicators menu. Default {@link BUILTIN_INDICATORS}; `[]` hides it.
   * Replace it with any mix of {@link builtinIndicators}, imported built-in
   * modules, and your own definitions.
   */
  indicators?: readonly IndicatorMenuItem[]
  /** Quick ranges in the bottom toolbar. Default {@link DATE_RANGE_PRESETS}. */
  ranges?: readonly DateRangePreset[]
  /**
   * Drawing tools from `@lightfin/core/annotations`; shows the left
   * toolbar and, for the selected drawing, a floating style toolbar. Omit
   * to leave them out (and the annotations code unloaded).
   */
  annotations?: Annotations
  /** Defaults to localStorage. Pass false to disable saving interactive settings. */
  persistence?: SettingsPersistence | false
  /** Override the default browser storage key for this chart. */
  persistenceKey?: string
  /** Handle storage errors. */
  onPersistenceError?: PersistenceErrorHandler
  /** Reset additional host options from the top toolbar's reset dialog. Throw or reject to report a failure. */
  onResetChartOptions?: () => void | Promise<void>
}

export interface Chrome {
  /** Resolves after the initial settings restore, including asynchronous adapters. */
  readonly ready: Promise<void>
  /** The active interval, including any restored value. */
  interval(): string | null
  /** Set the active interval (e.g. after the host switched it programmatically). */
  setInterval(interval: string | null): void
  /** Forget styles remembered for new drawings and return to the cursor. */
  resetDrawingToolDefaults(): void
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
  // Resolve before mounting so a bad entry fails without leaving styles behind.
  const catalog = (options.indicators ?? BUILTIN_INDICATORS).map(toCatalogEntry)
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

  const defaultInterval = options.interval ?? null
  const defaultCrosshairMode = chart.crosshairMode()
  let defaultChartType = chart.getSeries()?.chartType
  const chartTypes = options.chartTypes ?? CHART_TYPES
  const intervals = options.intervals ?? []
  let interval = defaultInterval
  let restoredChartType: ChartType | undefined
  let saveSettings: (() => void) | undefined
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

  // The left toolbar and the selected drawing's style toolbar share defaults.
  const drawings = options.annotations
  const toolStyles: ToolStyles = new Map()
  const left = drawings
    ? createLeftToolbar(chart, drawings, host, toolStyles)
    : null
  function resetDrawingToolDefaults(): void {
    toolStyles.clear()
    drawings?.setTool(null)
  }

  const top =
    options.topToolbar === false
      ? null
      : createTopToolbar(chart, {
          host,
          intervals,
          interval: () => interval,
          selectInterval,
          chartTypes,
          catalog,
          resetChartOptions: async () => {
            try {
              restoredChartType = undefined
              if (defaultChartType)
                chart.getSeries()?.setChartType(defaultChartType)
              chart.setCrosshairMode(defaultCrosshairMode)
              selectInterval(defaultInterval)
              saveSettings?.()
              await options.onResetChartOptions?.()
            } finally {
              if (left?.el.isConnected) left.sync()
            }
          },
          resetDrawingToolDefaults: drawings && resetDrawingToolDefaults,
        })

  // The left toolbar sits beside the chart, so the two share a row; the
  // selected drawing's style toolbar floats over the plot.
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
        now =>
          formatClock(now, timeZone(), chart.dateFormatters.timeWithSeconds),
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
  const offSeries = chart.on('seriesChange', series => {
    defaultChartType ??= series.chartType
    if (restoredChartType) {
      series.setChartType(restoredChartType)
      restoredChartType = undefined
    }
  })

  function applyInterval(next: string | null): void {
    if (next === interval) return
    interval = next
    top?.sync()
    hud?.invalidate()
    saveSettings?.()
  }

  function selectInterval(next: string | null): void {
    if (next === interval) return
    applyInterval(next)
    if (next !== null) options.onIntervalChange?.(next)
  }

  const settings =
    options.persistence === false
      ? undefined
      : bindPersistence(
          options.persistence ??
            localStoragePersistence<ChartSettings, Partial<ChartSettings>>(
              options.persistenceKey ?? chartStorageKey(root, 'settings'),
            ),
          saved => {
            if (
              saved.crosshairMode === 'normal' ||
              saved.crosshairMode === 'magnet'
            ) {
              chart.setCrosshairMode(saved.crosshairMode)
            }
            if (saved.chartType && chartTypes.includes(saved.chartType)) {
              const series = chart.getSeries()
              if (series) series.setChartType(saved.chartType)
              else restoredChartType = saved.chartType
            }
            if (
              saved.interval &&
              saved.interval !== interval &&
              (saved.interval === defaultInterval ||
                intervals.includes(saved.interval))
            ) {
              const restored = saved.interval
              applyInterval(restored)
              // Let the host finish mounting before asking it to load bars.
              queueMicrotask(() => {
                if (saveSettings && interval === restored) {
                  options.onIntervalChange?.(restored)
                }
              })
            }
          },
          save => {
            saveSettings = () =>
              save({
                interval,
                chartType: chart.getSeries()?.chartType ?? restoredChartType,
                crosshairMode: chart.crosshairMode(),
              })
            const offCrosshair = chart.on('crosshairModeChange', saveSettings)
            const offType = chart.on('dataChange', change => {
              if (change === 'style') saveSettings?.()
            })
            return () => {
              saveSettings = undefined
              offCrosshair()
              offType()
            }
          },
          options.onPersistenceError,
        )

  return {
    ready: settings?.ready ?? Promise.resolve(),
    interval: () => interval,
    setInterval: applyInterval,
    resetDrawingToolDefaults,
    dispose: () => {
      settings?.dispose()
      clearTimeout(clockTimer)
      offInstrument()
      offSeries()
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

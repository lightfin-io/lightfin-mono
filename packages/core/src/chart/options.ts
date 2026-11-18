export interface ChartTheme {
  /** Pane fill behind the plot; its lightness also decides the chrome's light/dark scheme. */
  background: string
  /** Horizontal/vertical grid line color. */
  gridColor: string
  /** Axis strip text + tick color. */
  axisTextColor: string
  /** Hairline color for axis borders. */
  axisBorderColor: string
  /** Up (bullish) candle/bar body + wick. */
  upColor: string
  /** Down (bearish) candle/bar body + wick. */
  downColor: string
  /** Volume histogram fill for up bars; usually semi-transparent so candles read through. */
  volumeUpColor: string
  /** Volume histogram fill for down bars. */
  volumeDownColor: string
  /** Stroke for the line and area chart types (and their current-price line). */
  lineColor: string
  /**
   * Area chart gradient fill. `areaTopColor` is at the top of the pane;
   * `areaBottomColor` is reached about a volume-bar's height above the bottom
   * and held to the edge (default fully transparent).
   */
  areaTopColor: string
  areaBottomColor: string
  /** Crosshair hairline color. */
  crosshairColor: string
  /** Font stack for all chart text — axis labels, crosshair, legend. */
  fontFamily: string
  /** Base font size in px for chart text. */
  fontSize: number
  /**
   * Default colors assigned to indicator plots in the order they're added
   * (PLAN §14), cycled when more indicators are added than colors in the
   * list. Only applies to a plot whose indicator didn't receive an explicit
   * color in its options — an explicit `color`/`macdColor`/etc. always wins.
   */
  indicatorPalette: string[]
}

/**
 * How the crosshair's horizontal line tracks the pointer in the price pane:
 * `normal` follows it freely; `magnet` snaps to the nearest open/high/low/close
 * of the hovered bar (its close, for line/area charts).
 */
export type CrosshairMode = 'normal' | 'magnet'

/**
 * Formats the date/time pieces the chart renders — axis tick labels, the
 * crosshair's time box, and the exchange clock (PLAN §15 "Date locale"). The
 * defaults produce English month names and a 24-hour clock; override any
 * subset to localize.
 *
 * IMPORTANT: every callback receives a **wall-clock-as-UTC** `Date` — the
 * instrument's local time already shifted into the Date's UTC fields. Read it
 * with the `getUTC*` accessors, and when delegating to `Intl.DateTimeFormat`
 * build it with `timeZone: 'UTC'` so it doesn't shift a second time. Each
 * callback has the shape of `Intl.DateTimeFormat.prototype.format`, so a bound
 * formatter can be passed straight through, e.g.
 * `{ month: new Intl.DateTimeFormat('de-DE', { month: 'short', timeZone: 'UTC' }).format }`.
 */
export interface DateFormatters {
  /** Time of day, e.g. "14:30" — intraday axis labels and the crosshair. */
  time(date: Date): string
  /** Time of day with seconds, e.g. "14:30:05" — second-granularity axis labels and the clock. */
  timeWithSeconds(date: Date): string
  /** Abbreviated month, e.g. "Jan" — month/day-granularity axis labels. */
  month(date: Date): string
  /** Month and day, e.g. "Jan 5" — day boundaries on intraday/day axis labels. */
  monthDay(date: Date): string
  /** Full calendar date, e.g. "Jan 5 2024" — the crosshair box on daily/coarser bars. */
  date(date: Date): string
  /** Full date and time, e.g. "Jan 5 14:30" — the crosshair box on intraday bars. */
  dateTime(date: Date): string
}

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
]

const pad = (n: number): string => (n < 10 ? `0${n}` : String(n))

/** English month names + a 24-hour clock, all read from the Date's UTC fields. */
export const DEFAULT_DATE_FORMATTERS: DateFormatters = {
  time: d => `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`,
  timeWithSeconds: d =>
    `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`,
  month: d => MONTHS[d.getUTCMonth()]!,
  monthDay: d => `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`,
  date: d => `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()} ${d.getUTCFullYear()}`,
  dateTime: d =>
    `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`,
}

export interface ChartOptions {
  theme: ChartTheme
  /** See {@link CrosshairMode}; switch later with `chart.setCrosshairMode()`. */
  crosshairMode: CrosshairMode
  /** Width in px reserved for the price axis strip on the right. */
  priceAxisWidth: number
  /** Height in px reserved for the time axis strip at the bottom. */
  timeAxisHeight: number
  /** Blank bars of room kept to the right of the newest bar (TradingView-style). */
  rightOffset: number
  /**
   * Draw the dotted horizontal line + price-axis badge at the last bar's close
   * (PLAN §8.3). On by default; set false for charts that don't want it.
   */
  priceLineVisible: boolean
  /**
   * Draw a volume histogram in the bottom slice of the main pane on a hidden,
   * auto-scaled volume scale (PLAN §7). Off by default (opt-in, lightweight);
   * only renders when the series actually carries volume. Colored by candle
   * direction, drawn behind the candles.
   */
  volumeVisible: boolean
  /** Fraction of the plot height the volume histogram occupies (PLAN §7: ~15–20%). */
  volumeHeightRatio: number
  /**
   * Minimum decimal places shown on price axis & crosshair labels (default 2,
   * i.e. normal currency). Extra decimals are added automatically when the
   * price-axis tick step is finer than this, e.g. sub-cent crypto prices.
   */
  priceDecimals: number
  /**
   * Overrides price label formatting entirely — e.g. for locales using "," or
   * " " as the decimal/thousands separator. Receives the price and the
   * decimal count computed from {@link ChartOptions.priceDecimals} and the
   * current tick step.
   */
  priceFormatter?: (price: number, decimals: number) => string
  /**
   * Localizes the date/time text on axis labels, the crosshair, and the clock.
   * Any subset overrides the English/24-hour {@link DEFAULT_DATE_FORMATTERS};
   * see {@link DateFormatters} for the wall-clock-as-UTC contract.
   */
  dateFormatters: DateFormatters
}

/** What consumers pass to {@link createChart} — every field optional, theme/formatters deep-partial. */
export type ChartOptionsInput = Partial<
  Omit<ChartOptions, 'theme' | 'dateFormatters'>
> & {
  theme?: Partial<ChartTheme>
  dateFormatters?: Partial<DateFormatters>
}

export const DEFAULT_THEME: ChartTheme = {
  background: '#131722',
  gridColor: '#1f2733',
  axisTextColor: '#9db2bd',
  axisBorderColor: '#2a2e39',
  upColor: '#26a69a',
  downColor: '#ef5350',
  volumeUpColor: 'rgba(38, 166, 154, 0.5)',
  volumeDownColor: 'rgba(239, 83, 80, 0.5)',
  lineColor: '#2962ff',
  areaTopColor: 'rgba(41, 98, 255, 0.28)',
  areaBottomColor: 'rgba(41, 98, 255, 0)',
  crosshairColor: '#758696',
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  fontSize: 11,
  indicatorPalette: [
    '#2962ff',
    '#ff6d00',
    '#7e57c2',
    '#26a69a',
    '#ec407a',
    '#9ccc65',
  ],
}

export const DEFAULT_OPTIONS: ChartOptions = {
  theme: DEFAULT_THEME,
  crosshairMode: 'normal',
  priceAxisWidth: 64,
  timeAxisHeight: 24,
  rightOffset: 6,
  priceDecimals: 2,
  priceLineVisible: true,
  volumeVisible: false,
  volumeHeightRatio: 0.18,
  dateFormatters: DEFAULT_DATE_FORMATTERS,
}

export function resolveOptions(partial: ChartOptionsInput): ChartOptions {
  return {
    ...DEFAULT_OPTIONS,
    ...partial,
    theme: { ...DEFAULT_THEME, ...partial.theme },
    dateFormatters: { ...DEFAULT_DATE_FORMATTERS, ...partial.dateFormatters },
  }
}

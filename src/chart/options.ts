export interface ChartTheme {
  background: string
  gridColor: string
  /** Axis strip text + tick color. */
  axisTextColor: string
  /** Hairline color for axis borders. */
  axisBorderColor: string
  upColor: string
  downColor: string
  /** Volume histogram fill for up bars; usually semi-transparent so candles read through. */
  volumeUpColor: string
  volumeDownColor: string
  /** Stroke for the line and area chart types (and their current-price line). */
  lineColor: string
  /** Area chart gradient fill, from the top of the pane down to its bottom. */
  areaTopColor: string
  areaBottomColor: string
  crosshairColor: string
  fontFamily: string
  fontSize: number
}

/**
 * How the crosshair's horizontal line tracks the pointer in the price pane:
 * `normal` follows it freely; `magnet` snaps to the nearest open/high/low/close
 * of the hovered bar (its close, for line/area charts).
 */
export type CrosshairMode = 'normal' | 'magnet'

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
}

/** What consumers pass to {@link createChart} — every field optional, theme deep-partial. */
export type ChartOptionsInput = Partial<Omit<ChartOptions, 'theme'>> & {
  theme?: Partial<ChartTheme>
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
  areaBottomColor: 'rgba(41, 98, 255, 0.02)',
  crosshairColor: '#758696',
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  fontSize: 11,
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
}

export function resolveOptions(partial: ChartOptionsInput): ChartOptions {
  return {
    ...DEFAULT_OPTIONS,
    ...partial,
    theme: { ...DEFAULT_THEME, ...partial.theme },
  }
}

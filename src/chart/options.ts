export interface ChartTheme {
  background: string
  gridColor: string
  /** Axis strip text + tick color. */
  axisTextColor: string
  /** Hairline color for axis borders. */
  axisBorderColor: string
  upColor: string
  downColor: string
  /** Wick color; defaults to body color when omitted at draw time. */
  wickUpColor: string
  wickDownColor: string
  crosshairColor: string
  fontFamily: string
  fontSize: number
}

export interface ChartOptions {
  theme: ChartTheme
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
  wickUpColor: '#26a69a',
  wickDownColor: '#ef5350',
  crosshairColor: '#758696',
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  fontSize: 11,
}

export const DEFAULT_OPTIONS: ChartOptions = {
  theme: DEFAULT_THEME,
  priceAxisWidth: 64,
  timeAxisHeight: 24,
  rightOffset: 6,
  priceDecimals: 2,
  priceLineVisible: true,
}

export function resolveOptions(partial: ChartOptionsInput): ChartOptions {
  return {
    ...DEFAULT_OPTIONS,
    ...partial,
    theme: { ...DEFAULT_THEME, ...partial.theme },
  }
}

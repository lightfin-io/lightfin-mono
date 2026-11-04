/**
 * Integer Unix seconds, UTC. The canonical time unit across the whole library
 * (scales, axes, adapters all assume seconds — see PLAN §6). Do not pass
 * milliseconds.
 */
export type UTCTimestamp = number

/**
 * The ergonomic data boundary. `setData`/`update` take this familiar shape;
 * internally it is transformed once into typed-array columns (see
 * {@link ColumnStore}). `volume` is optional — only histogram/volume series
 * read it.
 */
export interface Bar {
  time: UTCTimestamp
  open: number
  high: number
  low: number
  close: number
  volume?: number
}

/**
 * What the chart is showing (PLAN §6), for the HUD, axes, and clock. Set via
 * `chart.setInstrument(info)`.
 */
export interface InstrumentInfo {
  /** Ticker, e.g. "BTCUSD". */
  symbol: string
  /** Display name, e.g. "Bitcoin / US Dollar". Falls back to `symbol`. */
  name?: string
  /** The host's own market/instrument identifier, passed through untouched. */
  marketId?: string
  /** Exchange display name, e.g. "BINANCE". */
  exchange?: string
  /**
   * IANA timezone, e.g. "America/New_York". Intraday axis/crosshair labels and
   * the exchange clock render in it. Defaults to UTC.
   */
  timezone?: string
  /** Decimals for price labels and the HUD; overrides `priceDecimals`. */
  pricePrecision?: number
}

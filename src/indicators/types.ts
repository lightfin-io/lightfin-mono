/**
 * lightfin-web-chart indicator contract (PLAN §8.4).
 *
 * These are **types only** — importing them into the core costs zero runtime
 * bytes (erased under `verbatimModuleSyntax`). Each concrete indicator (SMA,
 * EMA, …) ships as its own dynamically-importable subpath module so the core
 * never carries the indicator catalog (PLAN §10).
 */

/**
 * Columnar, allocation-free read access to the bar data an indicator computes
 * against. Indexed by *logical* bar index (stable across backfill, PLAN §6),
 * valid for `firstIndex..lastIndex`.
 */
export interface BarReader {
  readonly size: number
  readonly firstIndex: number
  readonly lastIndex: number
  time(index: number): number
  open(index: number): number
  high(index: number): number
  low(index: number): number
  close(index: number): number
  /** NaN when the bar carried no volume. */
  volume(index: number): number
}

/** How one output series ("plot") of an indicator is drawn. */
export interface PlotStyle {
  /** Stable key identifying this plot within the indicator. */
  key: string
  /** Line (default) or histogram columns (e.g. MACD histogram). */
  type?: 'line' | 'histogram'
  color: string
  /** Fill for negative histogram columns; falls back to `color` when omitted. */
  negativeColor?: string
  /** Line width in CSS px (line plots only). Defaults to 1.5. */
  lineWidth?: number
}

/**
 * A horizontal reference line drawn across an indicator's own pane (e.g. RSI's
 * 30/70 lines, MACD's zero line).
 */
export interface ReferenceLevel {
  value: number
  color: string
  /** Draw dashed (default) rather than solid. */
  dashed?: boolean
}

/**
 * A translucent fill between two of an indicator's line plots (e.g. the
 * Bollinger band between its upper and lower lines).
 */
export interface BandFill {
  /** Plot key for the upper edge of the band. */
  upper: string
  /** Plot key for the lower edge of the band. */
  lower: string
  color: string
}

/**
 * The compute half of a live indicator instance. The one hard rule (PLAN §8.4):
 * panning/zooming must never call these — they only run on data change.
 *   - `calculateAll` recomputes every plot over the whole dataset (on reset /
 *     backfill).
 *   - `updateLast` recomputes only the newest bar (live tick or new bar), from
 *     already-committed prior outputs, so it stays O(1)/O(window).
 * `value` reads a cached output back for rendering/autoscale.
 */
export interface IndicatorCalc {
  /** Cached output for `plotKey` at logical `index`; NaN before warmup or if unknown. */
  value(plotKey: string, index: number): number
  calculateAll(reader: BarReader): void
  updateLast(reader: BarReader): void
}

/**
 * A fully-described indicator: metadata, its output plots, and a factory for a
 * fresh {@link IndicatorCalc}. This is what an indicator module default-exports.
 */
export interface IndicatorDefinition<Options = Record<string, never>> {
  /** Human-readable name, e.g. "SMA" (used for legends/labels later). */
  name: string
  /**
   * `true` → draws on the main pane and shares its price scale (moving
   * averages, Bollinger). `false` → its own sub-pane and scale (RSI, MACD).
   */
  overlay: boolean
  /** Options applied when the caller omits them. */
  defaultOptions: Options
  /** The plots this indicator emits for the given (resolved) options. */
  plots(options: Options): PlotStyle[]
  /** Optional translucent bands drawn between pairs of plots (behind the lines). */
  fills?(options: Options): BandFill[]
  /**
   * Pane indicators only: a fixed value range for the pane's scale (e.g. RSI's
   * 0–100). When omitted, the pane autoscales to its plots' visible values.
   */
  fixedRange?(options: Options): { min: number; max: number }
  /** Pane indicators only: horizontal reference lines (e.g. RSI 30/70). */
  levels?(options: Options): ReferenceLevel[]
  create(options: Options): IndicatorCalc
}

/** The shape of a dynamically-imported indicator module (`import('.../sma')`). */
export interface IndicatorModule<Options = Record<string, never>> {
  default: IndicatorDefinition<Options>
}

/** Handle returned by `chart.addIndicator`, for later removal. */
export interface IndicatorHandle {
  remove(): void
}

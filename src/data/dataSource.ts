import type { Bar, UTCTimestamp } from './types.ts'

/** A half-open-ish time window (inclusive seconds) a {@link DataSource} is asked to fill. */
export interface BarRange {
  /** Oldest time wanted, inclusive (Unix seconds UTC). */
  from: UTCTimestamp
  /** Newest time wanted, inclusive (Unix seconds UTC). */
  to: UTCTimestamp
}

/**
 * Pull-based data adapter (PLAN §6). Deliberately tiny so any backend — REST,
 * websocket, binary feed — can be wrapped in a few lines.
 *
 * `chart.setData()` / `series.setData()` already covers the static case (array
 * in, no adapter). This interface is only for consumers who want the chart to
 * fetch history on demand (infinite scroll-back) and/or stream live ticks
 * itself. Attach it with `chart.setDataSource(source)`.
 */
export interface DataSource {
  /**
   * Fetch bars whose time falls within `range`, for backfilling history as the
   * user pans left. May be sync or async; bars need not be pre-sorted, and bars
   * outside the current data are ignored defensively by the caller.
   */
  getBars(range: BarRange): Promise<Bar[]> | Bar[]

  /**
   * Subscribe to live bars. `onBar` is called for every tick; `isNewBar` is a
   * hint that the bar opens a new period, but the store decides authoritatively
   * from `bar.time` (equal time → mutate last, newer → append). Returns an
   * unsubscribe function the chart calls on teardown.
   */
  subscribeLive?(onBar: (bar: Bar, isNewBar: boolean) => void): () => void
}

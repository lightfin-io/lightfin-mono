import type { Bar, UTCTimestamp } from './types'

/** What the chart asks a {@link DataSource} for. */
export interface BarsRequest {
  /**
   * Return bars strictly older than this (Unix seconds UTC): the oldest bar
   * the chart holds. Absent on the first request, which wants the newest bars.
   */
  before?: UTCTimestamp
  /**
   * How many bars the chart wants: the newest `count` before `before`. Counted
   * in bars rather than time, so weekends and halts need no special casing.
   * Returning fewer is fine (e.g. an API page limit); the chart asks again if
   * it still needs more. Return `[]` only when no older bars exist: the chart
   * then stops asking.
   */
  count: number
  /**
   * Aborted once the chart no longer wants the result: the source was
   * replaced (e.g. an interval switch), the data was reset, or the chart was
   * removed. Pass it to `fetch`; a result that arrives anyway is dropped.
   */
  signal: AbortSignal
}

/**
 * Pull-based data adapter (PLAN §6). Attach it with `chart.setDataSource()`
 * and the chart drives loading: it asks for the newest screen of bars, then
 * for older pages as the view nears the oldest loaded bar, one request at a
 * time, and merges live bars at the right edge. `series.setData()` covers
 * the static case without an adapter.
 */
export interface DataSource {
  /**
   * Fetch bars for a {@link BarsRequest}. May be sync or async; bars need not
   * be sorted, and any at or after `before` are ignored.
   */
  getBars(request: BarsRequest): Promise<Bar[]> | Bar[]

  /**
   * Subscribe to live bars. Call `onBar` on every tick with the forming bar:
   * the same `time` as the last bar updates it, a newer one appends. Bars
   * older than the last bar are dropped, and bars that arrive before the
   * first `getBars` result are held and merged after it. Returns an
   * unsubscribe function the chart calls on teardown.
   */
  subscribeLive?(onBar: (bar: Bar) => void): () => void
}

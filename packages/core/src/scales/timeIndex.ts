import type { ColumnStore } from '../data/store'

/**
 * Fractional logical index of `time` (Unix seconds) on the index-based axis
 * (PLAN §3), for anchoring drawings by time. Inside the data it interpolates
 * between the bars either side, so a time between bars (e.g. drawn on a finer
 * interval) lands proportionally between them; past either end it
 * extrapolates at `interval` seconds per bar. NaN when the store is empty.
 */
export function timeToIndex(
  store: ColumnStore,
  time: number,
  interval: number,
): number {
  if (store.size === 0) return NaN
  const first = store.firstIndex
  const last = store.lastIndex
  const firstTime = store.times[store.physical(first)]!
  const lastTime = store.times[store.physical(last)]!
  if (time >= lastTime) return last + (time - lastTime) / interval
  if (time <= firstTime) return first - (firstTime - time) / interval
  const i = store.indexAtOrBefore(time)
  const t0 = store.times[store.physical(i)]!
  const t1 = store.times[store.physical(i + 1)]!
  return i + (time - t0) / (t1 - t0)
}

/** Inverse of {@link timeToIndex}: the time at a (fractional) logical index. */
export function indexToTime(
  store: ColumnStore,
  index: number,
  interval: number,
): number {
  if (store.size === 0) return NaN
  const first = store.firstIndex
  const last = store.lastIndex
  if (index >= last) {
    return store.times[store.physical(last)]! + (index - last) * interval
  }
  if (index <= first) {
    return store.times[store.physical(first)]! - (first - index) * interval
  }
  const i = Math.floor(index)
  const t0 = store.times[store.physical(i)]!
  const t1 = store.times[store.physical(i + 1)]!
  return t0 + (index - i) * (t1 - t0)
}

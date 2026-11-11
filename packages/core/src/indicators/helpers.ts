import type { BarReader, IndicatorCalc } from './types'

/**
 * Shared base for built-in indicators. Holds each plot's output as a plain
 * number column aligned to a logical base index, and drives both full and
 * incremental computation through a **single** {@link BaseCalc.computeAt} path
 * — so incremental updates are equivalent to a from-scratch recompute by
 * construction (the PLAN §8.4 hard requirement, verified in tests).
 *
 * `computeAt(reader, index)` must only read *prior* outputs (index-1 and
 * earlier, via {@link BaseCalc.prior}) and bar values, never later ones; then
 * it works unchanged whether called in a forward loop (`calculateAll`) or on
 * just the newest bar (`updateLast`).
 */
export abstract class BaseCalc implements IndicatorCalc {
  private base = 0
  private readonly columns = new Map<string, number[]>()

  constructor(plotKeys: readonly string[]) {
    for (const key of plotKeys) this.columns.set(key, [])
  }

  value(plotKey: string, index: number): number {
    const col = this.columns.get(plotKey)
    if (!col) return NaN
    const i = index - this.base
    return i >= 0 && i < col.length ? col[i]! : NaN
  }

  calculateAll(reader: BarReader): void {
    this.base = reader.firstIndex
    for (const col of this.columns.values()) col.length = 0
    if (reader.size === 0) return
    for (let i = reader.firstIndex; i <= reader.lastIndex; i++) {
      this.computeAt(reader, i)
    }
  }

  updateLast(reader: BarReader): void {
    if (reader.size === 0) return
    this.computeAt(reader, reader.lastIndex)
  }

  /** Store `value` for `plotKey` at logical `index`, extending the column if needed. */
  protected set(plotKey: string, index: number, value: number): void {
    const col = this.columns.get(plotKey)!
    const i = index - this.base
    while (col.length <= i) col.push(NaN)
    col[i] = value
  }

  /** A previously-committed output for `plotKey` at logical `index` (NaN if none). */
  protected prior(plotKey: string, index: number): number {
    return this.value(plotKey, index)
  }

  protected abstract computeAt(reader: BarReader, index: number): void
}

/** Simple mean of `close` over the `period` bars ending at (inclusive) `index`. */
export function meanClose(
  reader: BarReader,
  index: number,
  period: number,
): number {
  let sum = 0
  for (let j = index - period + 1; j <= index; j++) sum += reader.close(j)
  return sum / period
}

/**
 * Population standard deviation of `close` over the `period` bars ending at
 * `index`, given their precomputed `mean` (Bollinger convention: divide by N,
 * not N-1).
 */
export function stdDevClose(
  reader: BarReader,
  index: number,
  period: number,
  mean: number,
): number {
  let sumSq = 0
  for (let j = index - period + 1; j <= index; j++) {
    const d = reader.close(j) - mean
    sumSq += d * d
  }
  return Math.sqrt(sumSq / period)
}

/** The typical price of a bar, `(high + low + close) / 3` (used by CCI, VWAP). */
export function typicalPrice(reader: BarReader, index: number): number {
  return (reader.high(index) + reader.low(index) + reader.close(index)) / 3
}

/** Highest `high` over the `period` bars ending at (inclusive) `index`. */
export function highestHigh(
  reader: BarReader,
  index: number,
  period: number,
): number {
  let hi = -Infinity
  for (let j = index - period + 1; j <= index; j++)
    hi = Math.max(hi, reader.high(j))
  return hi
}

/** Lowest `low` over the `period` bars ending at (inclusive) `index`. */
export function lowestLow(
  reader: BarReader,
  index: number,
  period: number,
): number {
  let lo = Infinity
  for (let j = index - period + 1; j <= index; j++)
    lo = Math.min(lo, reader.low(j))
  return lo
}

/**
 * True Range for `index` — the greatest of the bar's range and its gaps from
 * the prior close. The first bar has no prior close, so its TR is just the
 * bar's high−low. Shared by ATR, ADX, and Keltner Channels.
 */
export function trueRange(reader: BarReader, index: number): number {
  const high = reader.high(index)
  const low = reader.low(index)
  if (index === reader.firstIndex) return high - low
  const prevClose = reader.close(index - 1)
  return Math.max(
    high - low,
    Math.abs(high - prevClose),
    Math.abs(low - prevClose),
  )
}

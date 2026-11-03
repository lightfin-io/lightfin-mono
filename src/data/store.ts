import type { Bar, UTCTimestamp } from './types.ts'

/**
 * Result of pushing a bar at the live edge: whether it extended the series with
 * a new bar or mutated the existing last bar in place (PLAN §8.3).
 */
export interface PushResult {
  index: number
  isNewBar: boolean
}

const MIN_CAPACITY = 64

/**
 * Columnar, gap-buffer-backed bar store (PLAN §6).
 *
 * Internal storage is parallel typed-array columns (times/opens/highs/…), not
 * an array of objects, to all but eliminate per-point allocation and GC
 * pressure (PLAN §9). The backing arrays carry headroom at *both* ends so the
 * two ways data grows are O(1) amortized and zero-copy:
 *   - append to the back  → live bars (newest)
 *   - prepend to the front → backfill from panning left (oldest)
 * When a side runs out we reallocate at (at least) doubled capacity and
 * recenter — O(N), but only O(log N) times total and off the render path.
 *
 * A `baseIndex` offset keeps a *logical index bound to the same bar for its
 * lifetime*: prepending decrements `baseIndex` instead of renumbering, so
 * index-keyed state (annotations, indicator caches) survives backfill.
 *
 * Logical index `i` (valid for firstIndex..lastIndex) maps to the physical
 * slot `head + (i - baseIndex)`.
 */
export class ColumnStore {
  private capacity = 0
  /** Physical slot of the oldest stored bar. */
  private head = 0
  /** Logical index assigned to the oldest stored bar. */
  private base = 0
  private count = 0
  private hasVolume = false

  times = new Float64Array(0)
  opens = new Float64Array(0)
  highs = new Float64Array(0)
  lows = new Float64Array(0)
  closes = new Float64Array(0)
  /** NaN where a bar carried no volume. */
  volumes = new Float64Array(0)

  /** Number of bars currently stored. */
  get size(): number {
    return this.count
  }

  /** Logical index of the oldest bar, or -1 when empty. */
  get firstIndex(): number {
    return this.count === 0 ? -1 : this.base
  }

  /** Logical index of the newest bar, or -1 when empty. */
  get lastIndex(): number {
    return this.count === 0 ? -1 : this.base + this.count - 1
  }

  get hasVolumeData(): boolean {
    return this.hasVolume
  }

  /** Physical backing slot for a logical index. Hot path — kept tiny. */
  physical(index: number): number {
    return this.head + (index - this.base)
  }

  /** Whether `index` currently addresses a stored bar. */
  has(index: number): boolean {
    return index >= this.firstIndex && index <= this.lastIndex
  }

  /**
   * Replace all data. Accepts the familiar Bar object array, sorts by time,
   * and transforms once into columns (PLAN §6). Logical indexing resets so the
   * oldest bar becomes index 0.
   */
  setData(bars: readonly Bar[]): void {
    const sorted = bars.slice().sort((a, b) => a.time - b.time)
    const n = sorted.length

    this.capacity = Math.max(MIN_CAPACITY, n * 2)
    this.allocate(this.capacity)
    this.head = Math.floor((this.capacity - n) / 2)
    this.base = 0
    this.count = n
    this.hasVolume = false

    for (let i = 0; i < n; i++) {
      const bar = sorted[i]!
      const p = this.head + i
      this.times[p] = bar.time
      this.opens[p] = bar.open
      this.highs[p] = bar.high
      this.lows[p] = bar.low
      this.closes[p] = bar.close
      if (bar.volume === undefined) {
        this.volumes[p] = NaN
      } else {
        this.volumes[p] = bar.volume
        this.hasVolume = true
      }
    }
  }

  /**
   * Push a bar at the live edge. If its time matches the last bar, mutate that
   * bar in place; if it is strictly newer, append. Returns the affected logical
   * index and whether a new bar was created. Throws if the bar predates the
   * last bar (use {@link prepend} for backfill).
   */
  push(bar: Bar): PushResult {
    if (this.count === 0) {
      this.setData([bar])
      return { index: this.base, isNewBar: true }
    }

    const lastPhys = this.head + this.count - 1
    const lastTime = this.times[lastPhys]!

    if (bar.time === lastTime) {
      this.writeBar(lastPhys, bar)
      return { index: this.lastIndex, isNewBar: false }
    }
    if (bar.time < lastTime) {
      throw new Error(
        `lightfin: update(bar) time ${bar.time} precedes last bar ${lastTime}; use backfill for older bars`,
      )
    }

    this.ensureBack(1)
    const p = this.head + this.count
    this.writeBar(p, bar)
    this.count++
    return { index: this.lastIndex, isNewBar: true }
  }

  /**
   * Backfill older bars at the front (oldest side). `base` shifts down by the
   * number prepended so existing logical indices keep pointing at their bars.
   * Bars must all predate the current oldest bar and be time-sorted ascending.
   */
  prepend(bars: readonly Bar[]): void {
    if (bars.length === 0) return
    if (this.count === 0) {
      this.setData(bars)
      return
    }
    const n = bars.length
    this.ensureFront(n)
    const start = this.head - n
    for (let i = 0; i < n; i++) {
      this.writeBar(start + i, bars[i]!)
    }
    this.head = start
    this.base -= n
    this.count += n
  }

  /** Read a logical index back into a Bar object. */
  get(index: number): Bar {
    if (!this.has(index)) {
      throw new RangeError(`lightfin: bar index ${index} out of range`)
    }
    const p = this.physical(index)
    const volume = this.volumes[p]!
    const bar: Bar = {
      time: this.times[p]!,
      open: this.opens[p]!,
      high: this.highs[p]!,
      low: this.lows[p]!,
      close: this.closes[p]!,
    }
    if (!Number.isNaN(volume)) bar.volume = volume
    return bar
  }

  /**
   * Logical index of the bar whose time is the greatest ≤ `time` (binary
   * search over `times`), or -1 if `time` precedes the first bar. Useful for
   * time→index lookups and crosshair snapping.
   */
  indexAtOrBefore(time: UTCTimestamp): number {
    if (this.count === 0 || time < this.times[this.head]!) return -1
    let lo = 0
    let hi = this.count - 1
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1
      if (this.times[this.head + mid]! <= time) lo = mid
      else hi = mid - 1
    }
    return this.base + lo
  }

  private writeBar(p: number, bar: Bar): void {
    this.times[p] = bar.time
    this.opens[p] = bar.open
    this.highs[p] = bar.high
    this.lows[p] = bar.low
    this.closes[p] = bar.close
    if (bar.volume === undefined) {
      this.volumes[p] = NaN
    } else {
      this.volumes[p] = bar.volume
      this.hasVolume = true
    }
  }

  private ensureBack(n: number): void {
    const backFree = this.capacity - (this.head + this.count)
    if (backFree >= n) return
    this.reallocate(this.count + n)
  }

  private ensureFront(n: number): void {
    if (this.head >= n) return
    this.reallocate(this.count + n)
  }

  /** Reallocate to at least `needed` bars (doubling) and recenter the data. */
  private reallocate(needed: number): void {
    const newCapacity = Math.max(MIN_CAPACITY, this.capacity * 2, needed * 2)
    const newHead = Math.floor((newCapacity - this.count) / 2)

    const old = {
      times: this.times,
      opens: this.opens,
      highs: this.highs,
      lows: this.lows,
      closes: this.closes,
      volumes: this.volumes,
    }
    this.allocate(newCapacity)
    const src = this.head
    this.times.set(old.times.subarray(src, src + this.count), newHead)
    this.opens.set(old.opens.subarray(src, src + this.count), newHead)
    this.highs.set(old.highs.subarray(src, src + this.count), newHead)
    this.lows.set(old.lows.subarray(src, src + this.count), newHead)
    this.closes.set(old.closes.subarray(src, src + this.count), newHead)
    this.volumes.set(old.volumes.subarray(src, src + this.count), newHead)

    this.capacity = newCapacity
    this.head = newHead
  }

  private allocate(capacity: number): void {
    this.times = new Float64Array(capacity)
    this.opens = new Float64Array(capacity)
    this.highs = new Float64Array(capacity)
    this.lows = new Float64Array(capacity)
    this.closes = new Float64Array(capacity)
    this.volumes = new Float64Array(capacity)
  }
}

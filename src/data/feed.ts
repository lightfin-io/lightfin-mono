import type { Series } from '../series/series'
import type { BarsRequest, DataSource } from './dataSource'
import type { Bar } from './types'

const RETRY_MIN_MS = 1000
const RETRY_MAX_MS = 30_000

/**
 * Loads one {@link DataSource} into the chart's series (PLAN §6): the initial
 * page, older pages on request, and live bars, kept as one contiguous run of
 * bars. History only ever extends the left edge and live bars the right, so
 * logical indices stay stable.
 *
 * One request is in flight at a time; asking again while it runs returns the
 * same promise. A request is aborted when its result would no longer apply
 * (the data was replaced, or the feed disposed), not when the view moves:
 * every older page extends the same edge, so it's still wanted. A failed
 * request backs off before the next one is allowed.
 */
export class DataFeed {
  private pending: Promise<number> | null = null
  private abort: AbortController | null = null
  private initialLoading = false
  // Live bars that arrived before the initial page, merged after it.
  private buffered: Bar[] = []
  // The source returned nothing older: we hold the start of its history.
  private exhausted = false
  private failures = 0
  private retryAt = 0
  private retryTimer: ReturnType<typeof setTimeout> | undefined
  private unsubscribe: (() => void) | undefined
  private disposed = false
  readonly source: DataSource
  private readonly series: Series
  /** Bars for the first page: enough to fill the view. */
  private readonly initialCount: () => number

  constructor(source: DataSource, series: Series, initialCount: () => number) {
    this.source = source
    this.series = series
    this.initialCount = initialCount
  }

  /** Clear the series, subscribe to live bars, and request the newest page. */
  start(): void {
    this.series.setData([])
    this.initialLoading = true
    this.unsubscribe = this.source.subscribeLive?.(bar => this.onLive(bar))
    this.loadInitial()
  }

  /**
   * Request `count` bars older than the oldest loaded one. Resolves to how
   * many bars the request added: 0 when there's nothing to load (history
   * exhausted, backing off after a failure, no data yet) or it failed.
   */
  loadOlder(count: number): Promise<number> {
    if (this.pending) return this.pending
    const { store } = this.series
    if (
      this.disposed ||
      this.exhausted ||
      store.size === 0 ||
      Date.now() < this.retryAt
    ) {
      return Promise.resolve(0)
    }
    const before = store.times[store.physical(store.firstIndex)]!
    return this.request({ before, count }, bars => {
      if (bars.length === 0) this.exhausted = true
      else this.series.prepend(bars)
      return bars.length
    })
  }

  /** Resolves once no request is in flight. */
  async settled(): Promise<void> {
    while (this.pending) await this.pending
  }

  /**
   * The series' data was replaced (by the host, or by this feed's initial
   * page): drop whatever was in flight against the old data.
   */
  dataReplaced(): void {
    this.cancel()
    this.exhausted = false
    this.failures = 0
    this.retryAt = 0
    if (this.initialLoading) {
      this.initialLoading = false
      this.buffered = []
    }
  }

  dispose(): void {
    this.disposed = true
    this.cancel()
    this.unsubscribe?.()
    this.buffered = []
  }

  private loadInitial(): void {
    void this.request({ count: this.initialCount() }, bars => {
      this.initialLoading = false
      const buffered = this.buffered
      this.buffered = []
      if (bars.length > 0) this.series.setData(bars)
      for (const bar of buffered) this.onLive(bar)
      return bars.length
    }).then(() => {
      if (this.initialLoading && !this.disposed) {
        this.retryTimer = setTimeout(
          () => this.loadInitial(),
          this.retryAt - Date.now(),
        )
      }
    })
  }

  private onLive(bar: Bar): void {
    if (this.disposed) return
    if (this.initialLoading) {
      const last = this.buffered.length - 1
      if (this.buffered[last]?.time === bar.time) this.buffered[last] = bar
      else this.buffered.push(bar)
      return
    }
    const { store } = this.series
    if (
      store.size > 0 &&
      bar.time < store.times[store.physical(store.lastIndex)]!
    ) {
      return
    }
    this.series.update(bar)
  }

  private request(
    request: Omit<BarsRequest, 'signal'>,
    apply: (bars: Bar[]) => number,
  ): Promise<number> {
    const abort = new AbortController()
    const settle = () => {
      if (this.abort === abort) {
        this.abort = null
        this.pending = null
      }
    }
    const pending = Promise.resolve()
      .then(() => this.source.getBars({ ...request, signal: abort.signal }))
      .then(
        bars => {
          if (abort.signal.aborted) return 0
          settle()
          this.failures = 0
          return apply(normalize(bars, request.before))
        },
        () => {
          if (abort.signal.aborted) return 0
          settle()
          this.failures++
          this.retryAt =
            Date.now() +
            Math.min(RETRY_MAX_MS, RETRY_MIN_MS * 2 ** (this.failures - 1))
          return 0
        },
      )
    this.abort = abort
    this.pending = pending
    return pending
  }

  private cancel(): void {
    this.abort?.abort()
    this.abort = null
    this.pending = null
    clearTimeout(this.retryTimer)
  }
}

/** Sorted ascending, one bar per time (the last wins), all before `before`. */
function normalize(bars: readonly Bar[], before: number | undefined): Bar[] {
  const kept =
    before === undefined ? bars.slice() : bars.filter(b => b.time < before)
  kept.sort((a, b) => a.time - b.time)
  const out: Bar[] = []
  for (const bar of kept) {
    if (out.length > 0 && out[out.length - 1]!.time === bar.time) {
      out[out.length - 1] = bar
    } else {
      out.push(bar)
    }
  }
  return out
}

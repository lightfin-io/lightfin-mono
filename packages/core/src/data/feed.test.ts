import { afterEach, describe, expect, it, vi } from 'vitest'

import { Series } from '../series/series'
import type { BarsRequest, DataSource } from './dataSource'
import { DataFeed } from './feed'
import type { Bar } from './types'

function bar(time: number, close = time): Bar {
  return { time, open: close, high: close, low: close, close }
}

/** Bars at times `from`, `from + 1`, … `to`. */
function bars(from: number, to: number): Bar[] {
  const out: Bar[] = []
  for (let t = from; t <= to; t++) out.push(bar(t))
  return out
}

/** A source whose `getBars` calls wait until the test resolves them. */
function deferredSource() {
  const calls: {
    request: BarsRequest
    resolve: (bars: Bar[]) => void
    reject: (err: Error) => void
  }[] = []
  let onBar: ((bar: Bar) => void) | null = null
  const unsubscribe = vi.fn()
  const source: DataSource = {
    getBars: request =>
      new Promise<Bar[]>((resolve, reject) =>
        calls.push({ request, resolve, reject }),
      ),
    subscribeLive: cb => {
      onBar = cb
      return unsubscribe
    },
  }
  return { source, calls, live: (b: Bar) => onBar!(b), unsubscribe }
}

/** A feed on a fresh series, reset-wired the way the chart wires it. */
function setup(source: DataSource, initialCount = 10) {
  const series = new Series()
  const loading: boolean[] = []
  const feed = new DataFeed(
    source,
    series,
    () => initialCount,
    l => loading.push(l),
  )
  series.onChange = change => {
    if (change === 'reset') feed.dataReplaced()
  }
  feed.start()
  return { series, feed, loading }
}

const times = (series: Series) => {
  const { store } = series
  const out: number[] = []
  for (let i = store.firstIndex; i <= store.lastIndex && store.size; i++) {
    out.push(store.times[store.physical(i)]!)
  }
  return out
}

const flush = () => new Promise(resolve => setTimeout(resolve, 0))

afterEach(() => {
  vi.useRealTimers()
})

describe('DataFeed', () => {
  it('asks for the newest page, with no `before`', async () => {
    const { source, calls } = deferredSource()
    setup(source, 42)
    await flush()
    expect(calls).toHaveLength(1)
    expect(calls[0]!.request).toMatchObject({ count: 42 })
    expect(calls[0]!.request.before).toBeUndefined()
  })

  it('merges live bars that arrive before the initial page', async () => {
    const { source, calls, live } = deferredSource()
    const { series } = setup(source)
    live(bar(9, 1)) // older than the page's last bar: dropped
    live(bar(10, 1))
    live(bar(10, 2)) // same bar ticking: the latest wins
    live(bar(11, 3))
    expect(series.store.size).toBe(0)
    await flush()
    calls[0]!.resolve(bars(1, 10))
    await flush()
    expect(times(series)).toEqual(bars(1, 11).map(b => b.time))
    expect(series.store.get(series.store.lastIndex - 1).close).toBe(2)
    expect(series.store.get(series.store.lastIndex).close).toBe(3)
  })

  it('drops live bars older than the last bar', async () => {
    const { source, calls, live } = deferredSource()
    const { series } = setup(source)
    await flush()
    calls[0]!.resolve(bars(1, 10))
    await flush()
    live(bar(5, 99))
    expect(series.store.get(series.store.lastIndex).time).toBe(10)
    expect(series.store.size).toBe(10)
  })

  it('pages history before the oldest bar, one request at a time', async () => {
    const { source, calls } = deferredSource()
    const { series, feed } = setup(source)
    await flush()
    calls[0]!.resolve(bars(11, 20))
    await flush()

    const first = feed.loadOlder(5)
    const second = feed.loadOlder(50)
    expect(second).toBe(first)
    await flush()
    expect(calls).toHaveLength(2)
    expect(calls[1]!.request).toMatchObject({ before: 11, count: 5 })

    // Overlap, duplicates, and disorder are cleaned up before prepending.
    calls[1]!.resolve([bar(10), bar(6), bar(12), bar(8), bar(7), bar(9)])
    expect(await first).toBe(5)
    expect(times(series)).toEqual(bars(6, 20).map(b => b.time))
  })

  it('stops asking once the source has no older bars', async () => {
    const { source, calls } = deferredSource()
    const { feed } = setup(source)
    await flush()
    calls[0]!.resolve(bars(1, 10))
    await flush()
    const done = feed.loadOlder(10)
    await flush()
    calls[1]!.resolve([])
    expect(await done).toBe(0)
    expect(await feed.loadOlder(10)).toBe(0)
    expect(calls).toHaveLength(2)
  })

  it('aborts and ignores a request when the data is replaced', async () => {
    const { source, calls } = deferredSource()
    const { series, feed } = setup(source)
    await flush()
    calls[0]!.resolve(bars(11, 20))
    await flush()
    const older = feed.loadOlder(10)
    await flush()
    const { signal } = calls[1]!.request

    series.setData(bars(100, 110))
    expect(signal.aborted).toBe(true)
    calls[1]!.resolve(bars(1, 10))
    expect(await older).toBe(0)
    expect(times(series)[0]).toBe(100)
  })

  it('aborts, unsubscribes, and ignores late results when disposed', async () => {
    const { source, calls, live, unsubscribe } = deferredSource()
    const { series, feed } = setup(source)
    await flush()
    feed.dispose()
    expect(calls[0]!.request.signal.aborted).toBe(true)
    expect(unsubscribe).toHaveBeenCalled()
    calls[0]!.resolve(bars(1, 10))
    live(bar(11))
    await flush()
    expect(series.store.size).toBe(0)
  })

  it('backs off after a failed history request', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const { source, calls } = deferredSource()
    const { feed } = setup(source)
    await flush()
    calls[0]!.resolve(bars(11, 20))
    await flush()
    const failed = feed.loadOlder(10)
    await flush()
    calls[1]!.reject(new Error('HTTP 429'))
    expect(await failed).toBe(0)

    expect(await feed.loadOlder(10)).toBe(0)
    expect(calls).toHaveLength(2)
    vi.advanceTimersByTime(1000)
    void feed.loadOlder(10)
    await flush()
    expect(calls).toHaveLength(3)
  })

  it('reports loading until the initial page resolves', async () => {
    const { source, calls } = deferredSource()
    const { loading } = setup(source)
    expect(loading).toEqual([true])
    await flush()
    calls[0]!.resolve(bars(1, 10))
    await flush()
    expect(loading).toEqual([true, false])
  })

  it('stops reporting loading if the data is replaced mid-fetch', async () => {
    const { source } = deferredSource()
    const { series, loading } = setup(source)
    series.setData(bars(100, 110))
    expect(loading).toEqual([true, false])
  })

  it('retries a failed initial page', async () => {
    vi.useFakeTimers()
    const { source, calls } = deferredSource()
    const { series } = setup(source)
    await vi.advanceTimersByTimeAsync(0)
    calls[0]!.reject(new Error('offline'))
    await vi.advanceTimersByTimeAsync(999)
    expect(calls).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(calls).toHaveLength(2)
    calls[1]!.resolve(bars(1, 10))
    await vi.advanceTimersByTimeAsync(0)
    expect(series.store.size).toBe(10)
  })
})

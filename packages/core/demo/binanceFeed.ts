import type { Bar, DataSource } from 'lightfin-web-chart'

// Binance's market-data-only hosts: public, keyless, CORS-enabled.
const REST_URL = 'https://data-api.binance.vision/api/v3/klines'
const WS_URL = 'wss://data-stream.binance.vision/ws'
// Binance's per-request cap; the chart asks again when it needs more.
const MAX_LIMIT = 1000
const RECONNECT_MIN_MS = 1000
const RECONNECT_MAX_MS = 30_000

export interface BinanceFeedOptions {
  /** Binance spot symbol, e.g. "BTCUSDT". */
  symbol: string
  /** Binance kline interval: 1m, 5m, 15m, 1h, 4h, 1d, … */
  interval: string
}

/** [openTime ms, open, high, low, close, volume, …] as Binance sends it. */
type Kline = [number, string, string, string, string, string, ...unknown[]]

interface KlineMessage {
  k: { t: number; o: string; h: string; l: string; c: string; v: string }
}

/**
 * A {@link DataSource} over Binance spot market data: REST klines for the
 * pages of history the chart asks for, and the kline websocket for the
 * forming bar. The chart drives paging, cancellation, and merging; this only
 * translates requests and keeps the socket alive.
 */
export function createBinanceFeed({
  symbol,
  interval,
}: BinanceFeedOptions): DataSource {
  async function klines(
    params: Record<string, number>,
    signal?: AbortSignal,
  ): Promise<Bar[]> {
    const query = new URLSearchParams({ symbol, interval })
    for (const [key, value] of Object.entries(params)) {
      query.set(key, String(value))
    }
    const res = await fetch(`${REST_URL}?${query}`, { signal })
    if (!res.ok) throw new Error(`Binance klines: HTTP ${res.status}`)
    const rows = (await res.json()) as Kline[]
    return rows.map(([t, o, h, l, c, v]) => ({
      time: t / 1000,
      open: +o,
      high: +h,
      low: +l,
      close: +c,
      volume: +v,
    }))
  }

  return {
    getBars({ before, count, signal }) {
      const limit = Math.min(count, MAX_LIMIT)
      // With only `endTime` (inclusive, ms), Binance returns the newest
      // `limit` klines opening at or before it; without it, the newest.
      return klines(
        before === undefined
          ? { limit }
          : { limit, endTime: before * 1000 - 1 },
        signal,
      )
    },

    subscribeLive(onBar) {
      let socket: WebSocket | null = null
      let lastTime: number | null = null
      let reconnectMs = RECONNECT_MIN_MS
      let reconnectTimer: ReturnType<typeof setTimeout> | undefined
      let closed = false
      // While replaying the bars missed during a disconnect, newer socket
      // bars wait here so everything reaches the chart in time order.
      let held: Bar[] | null = null
      let replay = 0

      const emit = (bar: Bar) => {
        if (lastTime !== null && bar.time < lastTime) return
        lastTime = bar.time
        onBar(bar)
      }

      const replayGap = (since: number) => {
        const id = ++replay
        held = []
        klines({ startTime: since * 1000, limit: MAX_LIMIT })
          .catch(() => [])
          .then(bars => {
            // A later reconnect started its own replay from the same bar.
            if (closed || id !== replay) return
            const pending = held ?? []
            held = null
            bars.forEach(emit)
            pending.forEach(emit)
          })
      }

      const connect = () => {
        const ws = new WebSocket(
          `${WS_URL}/${symbol.toLowerCase()}@kline_${interval}`,
        )
        socket = ws
        ws.onopen = () => {
          reconnectMs = RECONNECT_MIN_MS
          if (lastTime !== null) replayGap(lastTime)
        }
        ws.onmessage = e => {
          const { k } = JSON.parse(e.data as string) as KlineMessage
          const bar = {
            time: k.t / 1000,
            open: +k.o,
            high: +k.h,
            low: +k.l,
            close: +k.c,
            volume: +k.v,
          }
          if (held) held.push(bar)
          else emit(bar)
        }
        ws.onclose = () => {
          if (closed) return
          reconnectTimer = setTimeout(connect, reconnectMs)
          reconnectMs = Math.min(reconnectMs * 2, RECONNECT_MAX_MS)
        }
      }
      connect()

      return () => {
        closed = true
        clearTimeout(reconnectTimer)
        socket?.close()
      }
    },
  }
}

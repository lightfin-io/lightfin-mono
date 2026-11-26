import type { ColumnStore } from '../data/store'

export function heikinAshiClose(store: ColumnStore, p: number): number {
  return (
    (store.opens[p]! + store.highs[p]! + store.lows[p]! + store.closes[p]!) / 4
  )
}

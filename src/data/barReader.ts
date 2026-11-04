import type { BarReader } from '../indicators/types'
import type { ColumnStore } from './store'

/**
 * Adapts a {@link ColumnStore} to the indicator-facing {@link BarReader}
 * contract: logical-index accessors with no per-bar allocation (each call is
 * one `physical()` map + a typed-array read). Lets indicator code compute
 * against the columns without depending on the store's internals.
 */
export class StoreReader implements BarReader {
  private readonly store: ColumnStore

  constructor(store: ColumnStore) {
    this.store = store
  }

  get size(): number {
    return this.store.size
  }
  get firstIndex(): number {
    return this.store.firstIndex
  }
  get lastIndex(): number {
    return this.store.lastIndex
  }

  time(index: number): number {
    return this.store.times[this.store.physical(index)]!
  }
  open(index: number): number {
    return this.store.opens[this.store.physical(index)]!
  }
  high(index: number): number {
    return this.store.highs[this.store.physical(index)]!
  }
  low(index: number): number {
    return this.store.lows[this.store.physical(index)]!
  }
  close(index: number): number {
    return this.store.closes[this.store.physical(index)]!
  }
  volume(index: number): number {
    return this.store.volumes[this.store.physical(index)]!
  }
}

/** Minimal typed pub/sub used for the chart's public events. */
export class Emitter<Events extends object> {
  private readonly handlers = new Map<
    keyof Events,
    Set<(payload: never) => void>
  >()

  on<K extends keyof Events>(
    type: K,
    handler: (payload: Events[K]) => void,
  ): () => void {
    let set = this.handlers.get(type)
    if (!set) {
      set = new Set()
      this.handlers.set(type, set)
    }
    set.add(handler)
    return () => set.delete(handler)
  }

  emit<K extends keyof Events>(type: K, payload: Events[K]): void {
    const set = this.handlers.get(type)
    if (!set) return
    for (const handler of set) {
      ;(handler as (payload: Events[K]) => void)(payload)
    }
  }

  clear(): void {
    this.handlers.clear()
  }
}

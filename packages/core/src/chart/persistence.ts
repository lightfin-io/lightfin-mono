export interface Persistence<T, Saved = T> {
  load(): Saved | null | Promise<Saved | null>
  save(value: T): void | Promise<void>
}

export type PersistenceErrorHandler = (
  error: unknown,
  operation: 'load' | 'save',
) => void

export function localStoragePersistence<T, Saved = T>(
  key: string,
): Persistence<T, Saved> {
  return {
    load() {
      const saved = localStorage.getItem(key)
      return saved === null ? null : JSON.parse(saved)
    },
    save(value) {
      localStorage.setItem(key, JSON.stringify(value))
    },
  }
}

/** Scope implicit keys to the page and chart container. A container id survives layout changes. */
export function chartStorageKey(
  root: HTMLElement,
  kind: string,
  instrument?: { symbol: string; exchange?: string } | null,
): string {
  let container = root.parentElement
  if (container?.classList.contains('lf-body'))
    container = container.parentElement
  const path: number[] = []
  while (container && !container.id && container.parentElement) {
    const parent: HTMLElement = container.parentElement
    path.push([...parent.children].indexOf(container))
    container = parent
  }
  return `lightfin:${JSON.stringify([kind, root.ownerDocument.location?.pathname, container?.id, path, instrument?.exchange, instrument?.symbol])}`
}

export function bindPersistence<T, Saved>(
  persistence: Persistence<T, Saved>,
  restore: (saved: Saved) => void,
  subscribe: (save: (value: T) => void) => () => void,
  onError?: PersistenceErrorHandler,
): { ready: Promise<void>; dispose(): void } {
  let loading: boolean | 'restoring' = true
  let saving = false
  let disposed = false
  let pending: T | undefined

  async function flush(): Promise<void> {
    saving = true
    try {
      while (pending !== undefined) {
        const snapshot = pending
        pending = undefined
        try {
          const write = persistence.save(snapshot)
          if (write) await write
        } catch (error) {
          onError?.(error, 'save')
        }
      }
    } finally {
      saving = false
    }
  }

  const off = subscribe(value => {
    if (loading === 'restoring') return
    pending = value
    if (!loading && !saving) void flush()
  })

  async function load(): Promise<void> {
    try {
      const read = persistence.load()
      const saved =
        read && typeof (read as Promise<Saved>).then === 'function'
          ? await read
          : (read as Saved | null)
      if (!disposed && pending === undefined && saved !== null) {
        loading = 'restoring'
        restore(saved)
      }
    } catch (error) {
      if (!disposed) onError?.(error, 'load')
    } finally {
      loading = false
      if (pending !== undefined) void flush()
    }
  }

  return {
    ready: load(),
    dispose() {
      disposed = true
      off()
    },
  }
}

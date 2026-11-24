import type { Persistence, PersistenceErrorHandler } from '../chart/persistence'
import { bindPersistence, localStoragePersistence } from '../chart/persistence'
import type { Annotations } from './annotations'
import type { Annotation, AnnotationInput } from './types'

/** Storage for the complete drawing list of one chart or instrument. */
export type DrawingPersistence = Persistence<
  readonly Annotation[],
  readonly AnnotationInput[]
>

export interface AnnotationsOptions {
  /** Defaults to localStorage. Pass false for in-memory drawings. */
  persistence?: DrawingPersistence | false
  /** Override the default browser storage key for this chart and instrument. */
  persistenceKey?: string
  /** Handle storage or validation errors. */
  onPersistenceError?: PersistenceErrorHandler
}

/** Store drawings as JSON in the current browser under a host-chosen key. */
export const localStorageDrawingPersistence: (
  key: string,
) => DrawingPersistence = localStoragePersistence

/**
 * Manage persistence separately for drawings created with `persistence: false`.
 * Call the returned `dispose` when detaching. Saves already queued still finish.
 */
export function persistDrawings(
  drawings: Annotations,
  persistence: DrawingPersistence,
  onError?: PersistenceErrorHandler,
): { ready: Promise<void>; dispose(): void } {
  return bindPersistence(
    persistence,
    saved => drawings.load(saved),
    save => drawings.on('change', () => save(drawings.toJSON())),
    onError,
  )
}

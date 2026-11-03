/**
 * Integer Unix seconds, UTC. The canonical time unit across the whole library
 * (scales, axes, adapters all assume seconds — see PLAN §6). Do not pass
 * milliseconds.
 */
export type UTCTimestamp = number

/**
 * The ergonomic data boundary. `setData`/`update` take this familiar shape;
 * internally it is transformed once into typed-array columns (see
 * {@link ColumnStore}). `volume` is optional — only histogram/volume series
 * read it.
 */
export interface Bar {
  time: UTCTimestamp
  open: number
  high: number
  low: number
  close: number
  volume?: number
}

import { BaseCalc, typicalPrice } from './helpers'
import type { BarReader, IndicatorDefinition } from './types'

/**
 * Volume-Weighted Average Price (PLAN §8.4) — the average price weighted by
 * volume, accumulated from the start of each session. It re-anchors on every
 * new UTC day (times are Unix seconds, PLAN §6), the usual intraday
 * convention. An overlay line on the main price pane; it needs volume, so it
 * stays blank on volumeless data. Its own subpath module:
 * `import('@lightfin/core/indicators/vwap')`.
 */
export interface VwapOptions {
  color: string
  lineWidth: number
}

const VWAP = 'vwap'
// Internal running sums of price·volume and volume since the session anchor.
const CUM_PV = 'cumPv'
const CUM_VOL = 'cumVol'

const SECONDS_PER_DAY = 86_400

class VwapCalc extends BaseCalc {
  constructor() {
    super([VWAP, CUM_PV, CUM_VOL])
  }

  protected computeAt(reader: BarReader, index: number): void {
    const vol = reader.volume(index)
    const pv = Number.isFinite(vol) ? typicalPrice(reader, index) * vol : 0
    const addVol = Number.isFinite(vol) ? vol : 0

    // Re-anchor at the first bar and whenever the UTC day rolls over.
    const newSession =
      index === reader.firstIndex ||
      Math.floor(reader.time(index) / SECONDS_PER_DAY) !==
        Math.floor(reader.time(index - 1) / SECONDS_PER_DAY)

    const cumPv = newSession ? pv : this.prior(CUM_PV, index - 1) + pv
    const cumVol = newSession ? addVol : this.prior(CUM_VOL, index - 1) + addVol
    this.set(CUM_PV, index, cumPv)
    this.set(CUM_VOL, index, cumVol)
    // No volume accumulated yet (e.g. volumeless data) → nothing to plot.
    this.set(VWAP, index, cumVol > 0 ? cumPv / cumVol : NaN)
  }
}

const definition: IndicatorDefinition<VwapOptions> = {
  name: 'VWAP',
  overlay: true,
  colorKeys: ['color'],
  defaultOptions: { color: '#f7a600', lineWidth: 1.5 },
  plots: o => [{ key: VWAP, color: o.color, lineWidth: o.lineWidth }],
  create: () => new VwapCalc(),
}

export default definition

/**
 * "Nice" tick selection for the price axis (PLAN §7). Same family as D3's
 * `ticks()`: pick a round step (1/2/2.5/5 × 10ⁿ) near the target density and
 * emit the round values inside the domain.
 *
 * The interval-aware, index-based *time* ladder (1s/5s/… up to 1Y) lives in
 * `timeTicks.ts`; this module is price-axis only.
 */

/** Round `value` up/near to a 1/2/2.5/5 × 10ⁿ step. */
export function niceStep(value: number): number {
  if (value <= 0) return 1
  const exp = Math.floor(Math.log10(value))
  const pow = 10 ** exp
  const frac = value / pow
  let niceFrac: number
  if (frac <= 1) niceFrac = 1
  else if (frac <= 2) niceFrac = 2
  else if (frac <= 2.5) niceFrac = 2.5
  else if (frac <= 5) niceFrac = 5
  else niceFrac = 10
  return niceFrac * pow
}

/**
 * Round price values spanning `[min, max]` at roughly `targetCount` intervals.
 * Returns ascending values; empty for a degenerate domain.
 */
export function priceTicks(
  min: number,
  max: number,
  targetCount: number,
): number[] {
  if (!(max > min) || targetCount < 1) return []
  const step = niceStep((max - min) / targetCount)
  const first = Math.ceil(min / step) * step
  const ticks: number[] = []
  // Guard against FP drift producing a runaway loop.
  for (
    let v = first, i = 0;
    v <= max + step * 1e-9 && i < 1000;
    v += step, i++
  ) {
    // Re-snap each value to the step grid to kill accumulated FP error.
    ticks.push(Math.round(v / step) * step)
  }
  return ticks
}

/**
 * Number of decimal places to show for values spaced `step` apart, so labels
 * aren't over- or under-precise.
 */
export function stepDecimals(step: number): number {
  if (step >= 1 || step <= 0) return 0
  return Math.min(8, Math.ceil(-Math.log10(step)))
}

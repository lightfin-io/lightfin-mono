import { describe, expect, it } from 'vitest'

import { niceStep, priceTicks, stepDecimals } from './ticks'

describe('niceStep', () => {
  it('snaps to 1/2/2.5/5 × 10ⁿ', () => {
    expect(niceStep(0.8)).toBe(1)
    expect(niceStep(1.5)).toBe(2)
    expect(niceStep(2.3)).toBe(2.5)
    expect(niceStep(4)).toBe(5)
    expect(niceStep(8)).toBe(10)
    expect(niceStep(23)).toBe(25)
    expect(niceStep(230)).toBe(250)
  })
})

describe('priceTicks', () => {
  it('produces round values within the domain', () => {
    const ticks = priceTicks(0, 100, 5)
    expect(ticks).toEqual([0, 20, 40, 60, 80, 100])
  })

  it('starts at the first round value ≥ min', () => {
    const ticks = priceTicks(12, 47, 4)
    expect(ticks[0]).toBeGreaterThanOrEqual(12)
    expect(ticks.at(-1)!).toBeLessThanOrEqual(47)
    // uniform spacing
    expect(ticks[1]! - ticks[0]!).toBeCloseTo(ticks[2]! - ticks[1]!)
  })

  it('handles small fractional domains without FP drift', () => {
    const ticks = priceTicks(0.1, 0.3, 4)
    for (const t of ticks) expect(t).toBeCloseTo(Math.round(t * 20) / 20)
  })

  it('returns empty for a degenerate domain', () => {
    expect(priceTicks(5, 5, 5)).toEqual([])
  })
})

describe('stepDecimals', () => {
  it('scales precision to the step size', () => {
    expect(stepDecimals(100)).toBe(0)
    expect(stepDecimals(1)).toBe(0)
    expect(stepDecimals(0.5)).toBe(1)
    expect(stepDecimals(0.05)).toBe(2)
    expect(stepDecimals(0.001)).toBe(3)
  })
})

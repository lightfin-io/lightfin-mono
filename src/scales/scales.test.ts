import { describe, expect, it } from 'vitest'

import { PriceScale } from './priceScale.ts'
import { TimeScale } from './timeScale.ts'

describe('TimeScale', () => {
  it('round-trips index <-> x through the slot center', () => {
    const ts = new TimeScale(10, 0)
    // bar 0 centered at half a slot in.
    expect(ts.indexToX(0)).toBe(5)
    expect(ts.indexToX(1)).toBe(15)
    expect(ts.xToIndex(ts.indexToX(3))).toBeCloseTo(3)
    expect(ts.nearestIndex(16)).toBe(1)
  })

  it('pans by whole bars for a whole-bar pixel delta', () => {
    const ts = new TimeScale(10, 100)
    ts.panByPixels(-20) // drag content left by two bars
    expect(ts.scrollIndex).toBe(102)
  })

  it('keeps the anchored bar pinned under the cursor while zooming', () => {
    const ts = new TimeScale(10, 50)
    const anchorX = 240
    const indexBefore = ts.xToIndex(anchorX)
    ts.zoom(1.25, anchorX)
    expect(ts.barWidth).toBeCloseTo(12.5)
    // The index that was under the cursor is still under the cursor.
    expect(ts.xToIndex(anchorX)).toBeCloseTo(indexBefore)
  })

  it('reports the visible fractional index range', () => {
    const ts = new TimeScale(10, 100)
    const { from, to } = ts.visibleRange(200)
    expect(from).toBeCloseTo(99.5)
    expect(to).toBeCloseTo(119.5)
  })
})

describe('PriceScale', () => {
  it('maps the top of the domain to y=0 and bottom to y=height', () => {
    const ps = new PriceScale(0, 100)
    expect(ps.priceToY(100, 400)).toBe(0)
    expect(ps.priceToY(0, 400)).toBe(400)
    expect(ps.priceToY(50, 400)).toBe(200)
  })

  it('round-trips price <-> y', () => {
    const ps = new PriceScale(10, 20)
    expect(ps.yToPrice(ps.priceToY(17.5, 300), 300)).toBeCloseTo(17.5)
  })

  it('autoscales with symmetric margin', () => {
    const ps = new PriceScale(0, 1, 0.1)
    ps.autoScale(100, 200)
    expect(ps.min).toBeCloseTo(90)
    expect(ps.max).toBeCloseTo(210)
  })

  it('gives a flat range a non-zero band', () => {
    const ps = new PriceScale()
    ps.autoScale(50, 50)
    expect(ps.max).toBeGreaterThan(ps.min)
  })
})

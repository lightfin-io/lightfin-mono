import { describe, expect, it } from 'vitest'

import { hitsButton, orderButtonRect } from './orderIntent'

describe('orderButtonRect', () => {
  it('sits flush against the gutter, centered on the line', () => {
    expect(orderButtonRect(500, 100, 20, 0, 400)).toEqual({
      left: 480,
      top: 90,
      size: 20,
    })
  })

  it('stays inside the pane near its edges', () => {
    expect(orderButtonRect(500, 2, 20, 0, 400).top).toBe(0)
    expect(orderButtonRect(500, 399, 20, 0, 400).top).toBe(380)
  })
})

describe('hitsButton', () => {
  const rect = { left: 480, top: 90, size: 20 }

  it('hits inside and on the edges', () => {
    expect(hitsButton(rect, { x: 490, y: 100 })).toBe(true)
    expect(hitsButton(rect, { x: 480, y: 110 })).toBe(true)
  })

  it('misses outside', () => {
    expect(hitsButton(rect, { x: 479, y: 100 })).toBe(false)
    expect(hitsButton(rect, { x: 490, y: 111 })).toBe(false)
  })
})

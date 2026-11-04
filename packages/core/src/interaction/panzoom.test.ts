// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { HOLD_MS, PanZoomController } from './panzoom'

function fire(
  el: HTMLElement,
  type: string,
  x: number,
  pointerId = 1,
  pointerType = 'touch',
  y = 50,
): void {
  const e = new Event(type)
  Object.assign(e, { clientX: x, clientY: y, pointerId, pointerType })
  el.dispatchEvent(e)
}

describe('PanZoomController touch hold', () => {
  let el: HTMLElement
  let pz: PanZoomController
  const onPan = vi.fn()
  const onHold = vi.fn()

  beforeEach(() => {
    vi.useFakeTimers()
    el = document.createElement('div')
    el.setPointerCapture = () => {}
    el.hasPointerCapture = () => false
    pz = new PanZoomController(el, { onPan, onZoom: vi.fn(), onHold })
  })

  afterEach(() => {
    pz.dispose()
    onPan.mockReset()
    onHold.mockReset()
    vi.useRealTimers()
  })

  it('turns a still finger into a crosshair that follows it, without panning', () => {
    fire(el, 'pointerdown', 100)
    fire(el, 'pointermove', 103)
    vi.advanceTimersByTime(HOLD_MS)
    expect(onHold).toHaveBeenLastCalledWith({ x: 103, y: 50 })
    fire(el, 'pointermove', 160)
    expect(onHold).toHaveBeenLastCalledWith({ x: 160, y: 50 })
    expect(onPan).not.toHaveBeenCalled()
  })

  it('leaves the crosshair up on release', () => {
    fire(el, 'pointerdown', 100)
    vi.advanceTimersByTime(HOLD_MS)
    fire(el, 'pointerup', 100)
    expect(onHold).not.toHaveBeenCalledWith(null)
  })

  it('pans by the full distance once a drag passes the slop', () => {
    fire(el, 'pointerdown', 100)
    fire(el, 'pointermove', 104)
    fire(el, 'pointermove', 120)
    expect(onPan).toHaveBeenCalledWith(20)
    vi.advanceTimersByTime(HOLD_MS)
    expect(onHold).not.toHaveBeenCalled()
  })

  it('clears the crosshair when a second finger starts a pinch', () => {
    fire(el, 'pointerdown', 100)
    vi.advanceTimersByTime(HOLD_MS)
    fire(el, 'pointerdown', 200, 2)
    expect(onHold).toHaveBeenLastCalledWith(null)
  })

  it('pans a mouse drag immediately and never holds', () => {
    fire(el, 'pointerdown', 100, 1, 'mouse')
    fire(el, 'pointermove', 102, 1, 'mouse')
    vi.advanceTimersByTime(HOLD_MS)
    expect(onPan).toHaveBeenCalledWith(2)
    expect(onHold).not.toHaveBeenCalled()
  })
})

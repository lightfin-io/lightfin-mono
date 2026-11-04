// @vitest-environment jsdom
import { createChart } from 'lightfin-web-chart'
import type { Chart, InstrumentInfo } from 'lightfin-web-chart'
import { act, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { LightfinChart } from './LightfinChart'
import { useChart, useChartEffect } from './index'

// Construct no real chart — jsdom has no canvas 2D context or ResizeObserver.
// We own the wrapper logic (lifecycle, event latching, context); the real
// engine is covered by the core package's Playwright suite (PLAN §12).
vi.mock('lightfin-web-chart', () => ({ createChart: vi.fn() }))

/** A fake chart that records subscriptions and can emit to them. */
function makeFakeChart() {
  const listeners = new Map<string, Set<(payload: unknown) => void>>()
  return {
    on: vi.fn((type: string, handler: (payload: unknown) => void) => {
      const set = listeners.get(type) ?? new Set()
      set.add(handler)
      listeners.set(type, set)
      return () => set.delete(handler)
    }),
    emit(type: string, payload?: unknown) {
      listeners.get(type)?.forEach(h => h(payload))
    },
    onOrderIntent: vi.fn((_handler: (e: unknown) => void) => () => {}),
    setInstrument: vi.fn(),
    remove: vi.fn(),
  }
}
type FakeChart = ReturnType<typeof makeFakeChart>

const mockedCreateChart = vi.mocked(createChart)

// Tell React this is an act() environment so effects flush synchronously.
;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement
let root: ReturnType<typeof createRoot>

beforeEach(() => {
  mockedCreateChart.mockReset()
  mockedCreateChart.mockImplementation(
    () => makeFakeChart() as unknown as Chart,
  )
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

/** The fake returned by the Nth createChart call. */
function fakeChart(n = 0): FakeChart {
  return mockedCreateChart.mock.results[n]!.value as unknown as FakeChart
}

describe('LightfinChart', () => {
  it('creates a chart on mount and removes it on unmount', () => {
    act(() => root.render(<LightfinChart />))
    expect(mockedCreateChart).toHaveBeenCalledTimes(1)
    expect(mockedCreateChart.mock.calls[0]![0]).toBeInstanceOf(HTMLDivElement)

    const chart = fakeChart()
    expect(chart.remove).not.toHaveBeenCalled()
    act(() => root.unmount())
    expect(chart.remove).toHaveBeenCalledTimes(1)
    // Re-create a root so afterEach's unmount is a no-op.
    root = createRoot(container)
  })

  it('calls onCreate once with the instance', () => {
    const onCreate = vi.fn()
    act(() => root.render(<LightfinChart onCreate={onCreate} />))
    expect(onCreate).toHaveBeenCalledTimes(1)
    expect(onCreate).toHaveBeenCalledWith(fakeChart())
  })

  it('forwards chart events to handler props', () => {
    const onCrosshairMove = vi.fn()
    act(() => root.render(<LightfinChart onCrosshairMove={onCrosshairMove} />))
    const chart = fakeChart()

    const payload = { index: 3 }
    act(() => chart.emit('crosshairMove', payload))
    expect(onCrosshairMove).toHaveBeenCalledWith(payload)
  })

  it('latches handlers: a new handler prop needs no resubscribe', () => {
    const first = vi.fn()
    act(() => root.render(<LightfinChart onCrosshairMove={first} />))
    const chart = fakeChart()
    const subs = chart.on.mock.calls.filter(c => c[0] === 'crosshairMove')
    expect(subs).toHaveLength(1)

    const second = vi.fn()
    act(() => root.render(<LightfinChart onCrosshairMove={second} />))
    // Still a single subscription for the event.
    expect(
      chart.on.mock.calls.filter(c => c[0] === 'crosshairMove'),
    ).toHaveLength(1)

    act(() => chart.emit('crosshairMove', null))
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
  })

  it('registers order-intent only while a handler is passed', () => {
    act(() => root.render(<LightfinChart />))
    const chart = fakeChart()
    expect(chart.onOrderIntent).not.toHaveBeenCalled()

    const handler = vi.fn()
    act(() => root.render(<LightfinChart onOrderIntent={handler} />))
    expect(chart.onOrderIntent).toHaveBeenCalledTimes(1)
  })

  it('applies the instrument prop and leaves it alone when undefined', () => {
    act(() => root.render(<LightfinChart />))
    const chart = fakeChart()
    expect(chart.setInstrument).not.toHaveBeenCalled()

    const info: InstrumentInfo = { symbol: 'BTCUSD' }
    act(() => root.render(<LightfinChart instrument={info} />))
    expect(chart.setInstrument).toHaveBeenCalledWith(info)
  })

  it('exposes the instance through a ref', () => {
    let captured: Chart | null = null
    function Grab() {
      const ref = useRef<Chart | null>(null)
      return (
        <LightfinChart
          ref={c => {
            ref.current = c
            captured = c
          }}
        />
      )
    }
    act(() => root.render(<Grab />))
    expect(captured).toBe(fakeChart())
  })
})

describe('useChartEffect', () => {
  it('runs with the instance and cleans up on unmount', () => {
    const run = vi.fn()
    const cleanup = vi.fn()
    function Feature() {
      useChartEffect(chart => {
        run(chart)
        return cleanup
      }, [])
      return null
    }
    act(() =>
      root.render(
        <LightfinChart>
          <Feature />
        </LightfinChart>,
      ),
    )
    expect(run).toHaveBeenCalledTimes(1)
    expect(run).toHaveBeenCalledWith(fakeChart())
    expect(cleanup).not.toHaveBeenCalled()

    act(() => root.unmount())
    expect(cleanup).toHaveBeenCalledTimes(1)
    root = createRoot(container)
  })

  it('throws when useChart is used outside the provider', () => {
    function Orphan() {
      useChart()
      return null
    }
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => act(() => root.render(<Orphan />))).toThrow(
      /must be used inside <LightfinChart>/,
    )
    spy.mockRestore()
  })
})

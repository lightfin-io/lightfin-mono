import { createChart } from '@lightfin/core'
import type {
  Chart,
  ChartOptionsInput,
  CrosshairMoveEvent,
  InstrumentInfo,
  OrderIntentEvent,
  Series,
  SeriesChange,
} from '@lightfin/core'
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import type { CSSProperties, ReactNode } from 'react'

import { ChartContext } from './context'

// The chart needs the DOM, so it is only ever created client-side; fall back to
// useEffect on the server so SSR renders the wrapper without a warning.
const useIsomorphicLayoutEffect =
  typeof window !== 'undefined' ? useLayoutEffect : useEffect

export interface LightfinChartProps {
  /**
   * Core options (theme, rightOffset, crosshairMode, …), applied once when the
   * chart is created. The engine has no live option setter, so later changes
   * are ignored — give the component a new `key` to recreate it with fresh
   * options.
   */
  options?: ChartOptionsInput
  /**
   * Instrument metadata. Re-applied whenever it changes; pass `null`
   * to clear, or omit to leave whatever was set imperatively untouched.
   */
  instrument?: InstrumentInfo | null
  /** Class on the outer container the chart fills. Give it a size. */
  className?: string
  /** Inline style on the outer container. Give it a size (e.g. `height`). */
  style?: CSSProperties
  onCrosshairMove?: (event: CrosshairMoveEvent | null) => void
  onDataChange?: (change: SeriesChange) => void
  onSeriesChange?: (series: Series) => void
  onIndicatorsChange?: () => void
  onLayoutChange?: () => void
  onInstrumentChange?: (info: InstrumentInfo | null) => void
  /**
   * Opt in to the order-intent "+" button. The button only shows
   * while this handler is set.
   */
  onOrderIntent?: (event: OrderIntentEvent) => void
  /** Called once with the instance right after it is created. */
  onCreate?: (chart: Chart) => void
  /**
   * Feature components (see {@link useChartEffect}). They read the chart from
   * context and typically render nothing.
   */
  children?: ReactNode
}

/**
 * Owns a lightfin chart's lifecycle inside React: creates it on mount, removes
 * it on unmount, keeps event-handler props and the `instrument` wired up, and
 * publishes the instance through a `ref` and to child feature components.
 *
 * ```tsx
 * <LightfinChart style={{ height: 420 }} options={{ theme }}>
 *   <Candles bars={bars} />
 * </LightfinChart>
 * ```
 */
export const LightfinChart = forwardRef<Chart | null, LightfinChartProps>(
  function LightfinChart(props, ref) {
    const { className, style, instrument, onOrderIntent, children } = props
    const containerRef = useRef<HTMLDivElement>(null)
    const [chart, setChart] = useState<Chart | null>(null)

    // Latest props in a ref so the one-time event subscriptions always reach
    // the current handlers without resubscribing on every render.
    const propsRef = useRef(props)
    propsRef.current = props

    // Options are read once; see the prop doc for why changes need a new key.
    const optionsRef = useRef(props.options)

    useIsomorphicLayoutEffect(() => {
      const container = containerRef.current
      if (!container) return
      const instance = createChart(container, optionsRef.current ?? {})
      propsRef.current.onCreate?.(instance)
      setChart(instance)
      return () => {
        instance.remove()
        setChart(null)
      }
    }, [])

    useImperativeHandle<Chart | null, Chart | null>(ref, () => chart, [chart])

    // Subscribe to the latched event handlers once per chart instance.
    useEffect(() => {
      if (!chart) return
      const p = propsRef
      const offs = [
        chart.on('crosshairMove', e => p.current.onCrosshairMove?.(e)),
        chart.on('dataChange', e => p.current.onDataChange?.(e)),
        chart.on('seriesChange', s => p.current.onSeriesChange?.(s)),
        chart.on('indicatorsChange', () => p.current.onIndicatorsChange?.()),
        chart.on('layoutChange', () => p.current.onLayoutChange?.()),
        chart.on('instrumentChange', i => p.current.onInstrumentChange?.(i)),
      ]
      return () => {
        for (const off of offs) off()
      }
    }, [chart])

    // Order-intent is its own effect so the "+" button only exists while the
    // host actually passes a handler.
    useEffect(() => {
      if (!chart || !onOrderIntent) return
      return chart.onOrderIntent(onOrderIntent)
    }, [chart, onOrderIntent])

    // Keep the instrument in sync; `undefined` means "leave it alone".
    useEffect(() => {
      if (!chart || instrument === undefined) return
      chart.setInstrument(instrument)
    }, [chart, instrument])

    return (
      <div className={className} style={style}>
        <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
        <ChartContext.Provider value={chart}>{children}</ChartContext.Provider>
      </div>
    )
  },
)

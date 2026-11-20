# @lightfin/react

React bindings for
[@lightfin/core](https://github.com/lightfin-io/lightfin-mono/tree/main/packages/core):
`<LightfinChart>` owns the
chart's lifecycle, `useChartEffect` wires features onto it imperatively, and
`useChart` reads the instance from context. A thin wrapper — the chart engine
itself is framework-agnostic vanilla TypeScript.

## Install

```sh
bun add @lightfin/react @lightfin/core
```

`@lightfin/core` and `react` (>=18) are peer dependencies.

## Quick start

```tsx
import type { Bar } from '@lightfin/core'
import { LightfinChart, useChartEffect } from '@lightfin/react'

function Candles({ bars }: { bars: Bar[] }) {
  useChartEffect(
    chart => {
      chart.addCandlestickSeries().setData(bars)
    },
    [bars],
  )
  return null
}

function App({ bars }: { bars: Bar[] }) {
  return (
    <LightfinChart style={{ height: 420 }}>
      <Candles bars={bars} />
    </LightfinChart>
  )
}
```

`<LightfinChart>` creates the chart on mount and removes it on unmount. Give
it a size via `className`/`style` on the outer container. Everything else —
series, indicators, chrome, annotations, price lines — is wired on
imperatively by child components using `useChartEffect`, the same escape
hatch the core API uses directly.

## API

- **`<LightfinChart>`** — `options` (applied once; give the component a new
  `key` to recreate it with different options), `instrument`, event props
  (`onCrosshairMove`, `onDataChange`, `onSeriesChange`, `onIndicatorsChange`,
  `onLayoutChange`, `onInstrumentChange`, `onOrderIntent`), `onCreate`, and a
  `ref` to the underlying `Chart`.
- **`useChartEffect(effect, deps)`** — runs `effect(chart)` once the chart
  exists and on every `deps` change, cleaning up the returned function on
  rerun/unmount. The general-purpose hook for anything imperative:
  `chart.addCandlestickSeries()`, `chart.addIndicator(...)`,
  `createChrome(chart, ...)`, `createAnnotations(chart, ...)`,
  `chart.addPriceLine(...)`.
- **`useChart()`** — the `Chart` instance from the nearest `<LightfinChart>`,
  or `null` until it's created (one frame after mount). Throws outside a
  `<LightfinChart>`.

## Order intent

Pass `onOrderIntent` to opt in to the chart's "+" button; it only shows while
the handler is set. The host owns the order form — the callback just receives
price and coordinates.

## Development

From the monorepo root (see the
[root README](https://github.com/lightfin-io/lightfin-mono/)):

```sh
bun run --filter @lightfin/react test
bun run --filter @lightfin/react build
```

## License

MIT

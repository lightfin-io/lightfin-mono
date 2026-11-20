# @lightfin/core

A lightweight, dependency-free financial charting library for the web —
candlesticks, volume, indicators, drawing tools, smooth pan/zoom, and live
data, rendered on HTML5 Canvas2D. Framework-agnostic vanilla TypeScript,
tree-shakeable, and easy to wire to any data source.

Bars in, chart out. Lightfin renders and handles interaction; data,
persistence, and the trading UI stay with the host. It is not a backtesting
engine, a data service, or an order-entry UI — `onOrderIntent` fires
price and coordinates so the host can open its own form.

Part of the [Lightfin monorepo](https://github.com/lightfin-io/lightfin-mono/).
Open work is in
[ROADMAP.md](https://github.com/lightfin-io/lightfin-mono/blob/main/ROADMAP.md).

## Install

No runtime dependencies.

```sh
bun add @lightfin/core
```

React apps should also add `@lightfin/react` (`react` and this package are
its peer dependencies).

## Quick start

Give the container a size. The chart fills it and watches for resizes.

```html
<div id="chart" style="height: 420px"></div>
```

```ts
import { createChart } from '@lightfin/core'

const chart = createChart(document.querySelector('#chart')!, {
  volumeVisible: true,
})

const series = chart.addCandlestickSeries()
series.setData([
  { time: 1704067200, open: 100, high: 104, low: 99, close: 103, volume: 1200 },
  { time: 1704070800, open: 103, high: 106, low: 102, close: 101, volume: 980 },
])

series.setChartType('line') // 'candlestick' | 'bar' | 'line' | 'area'
series.update(bar) // live tick or a new bar
```

`time` is a UTC timestamp in integer Unix seconds. `setData` replaces the
series; `update` appends or revises the latest bar.

```ts
const sma = await chart.addIndicator(import('@lightfin/core/indicators/sma'), {
  period: 20,
})
```

## What's included

- **Series** — candlestick, bar, line, and area, switchable in place with
  `setChartType()`. Volume histogram on a hidden sub-scale.
- **Indicators** — 16 built-ins (SMA, EMA, WMA, Bollinger, Keltner, VWAP, RSI,
  MACD, Stochastic, Williams %R, CCI, ROC, ADX, ATR, OBV, Volume MA), overlaid
  or on a resizable pane. Each is its own subpath so unused ones stay out of
  the bundle. Custom indicators use the same contract.
- **Drawing tools** — 21 types (lines, channels, pitchfork, regression, fibs,
  shapes, brush, labels, position and range measures) with undo/redo, lock/hide,
  and a per-drawing style toolbar. JSON in and out, including a schema an AI
  can drive.
- **Live data** — `setData` for a static series, or a `DataSource` that pages
  history and merges a live stream. Follow-mode keeps the latest bar in view.
- **Chrome** — optional HUD/legend, interval and chart-type toolbars, indicator
  menu, go-to-date modal, exchange clock, fullscreen.
- **Price lines and event tags** — host-managed order and position lines;
  earnings and dividend tags along the price pane. The host renders the detail
  card and the order form.
- **Interaction** — pointer pan/zoom anchored on the cursor, crosshair (including
  touch press-and-hold), magnet mode, keyboard control with screen-reader output.

## Subpath exports

The package entry is the chart engine, series, axes, and crosshair. Everything
else is opt-in:

| Import                              | What it adds                                    |
| ----------------------------------- | ----------------------------------------------- |
| `@lightfin/core`                    | Chart engine, series, axes, crosshair, pan/zoom |
| `@lightfin/core/indicators/<id>`    | One indicator, usually via dynamic `import()`   |
| `@lightfin/core/annotations`        | Drawing tools                                   |
| `@lightfin/core/annotations/schema` | JSON Schema for AI-driven drawings              |
| `@lightfin/core/chrome`             | HUD, legend, toolbars, clock                    |
| `@lightfin/core/price-lines`        | Order and position price lines                  |
| `@lightfin/core/event-tags`         | Earnings and dividend tags                      |

## Development

From the monorepo root (see the
[root README](https://github.com/lightfin-io/lightfin-mono/)):

```sh
bun run dev                      # this package's /demo playground
bun run --filter @lightfin/core test
bun run --filter @lightfin/core test:e2e
bun run --filter @lightfin/core build
```

`demo/` is the manual playground and the Playwright target. It loads live
BTC/USDT from Binance; `?feed=mock` uses a deterministic offline feed and
`?live=0` holds the chart still. `demo/stress.html` loads 500k bars.

## License

MIT

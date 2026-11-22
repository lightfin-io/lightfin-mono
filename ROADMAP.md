# Roadmap

Pre-1.0. Rendering, live data, the indicator framework, chrome, drawing tools, price lines, event tags, the React binding, and the docs site are in the repo. This file is the work that is not.

## Chart settings

- A chart settings modal for theme and chart options. Options apply at `createChart()` time today; indicator settings already have their own dialog.
- Reset chart options and drawing-tool defaults.

## Annotations

Drawings already serialize to JSON (`toJSON` / `load`). Persisting them is the host's job — the demo writes `localStorage` — and chrome has no save/restore control.

Also unbuilt:

- A per-drawing settings dialog for exact coordinates and per-level Fibonacci toggles. The floating style toolbar covers color, line, and text.
- Per-drawing visibility. `setVisible()` hides every drawing at once.
- Gann, Elliott, and pattern tools.

## Indicators

Sixteen built-ins ship (SMA, EMA, WMA, Bollinger, Keltner, VWAP, RSI, MACD, Stochastic, Williams %R, CCI, ROC, ADX, ATR, OBV, Volume MA). No specific next one is chosen. A new indicator is a module under `packages/core/src/indicators/` on the existing contract, plus a size-limit entry.

## Date locale

Axis and crosshair month names are English, and the exchange clock is 24-hour `en-GB`. Prices already go through `priceFormatter`. A `locale` option would format dates with `Intl.DateTimeFormat` too.

`DateFormatters` is the override point today. Each callback receives a wall-clock-as-UTC `Date`: read it with the `getUTC*` accessors, and pass `timeZone: 'UTC'` when delegating to `Intl`.

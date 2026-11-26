# Lightfin

Guidance for changing this repo. The public API and comments in the code are the source of truth for behavior.

## What this is

A framework-agnostic charting library: bars in, chart out. Canvas2D rendering and pointer interaction, wired to whatever data the host supplies. It is a rendering library. Backtesting, order entry, hosted market data, and exchange adapters stay outside it.

The host owns:

- data loading (a `DataSource`, or `setData` / `update`)
- chart identity and optional storage overrides (annotations and interactive chrome settings default to localStorage)
- the order form (`onOrderIntent` reports price and coordinates)
- the event-tag detail card (`onSelect` reports the event and position)
- any model call (the annotations schema is a tool definition; the library never calls a model)

## Repo

Bun workspace. Use `bun`, not npm or pnpm. Root scripts (`build`, `test`, `typecheck`, `size`) fan out to packages.

| Path | Package | Role |
| --- | --- | --- |
| `packages/core` | `@lightfin/core` | Chart library. Zero runtime dependencies. `demo/` is the playground and the Playwright target. `e2e/` is the browser suite. |
| `packages/react` | `@lightfin/react` | Thin React binding. `react` and the core are peer dependencies. |
| `packages/www` | `@lightfin/www` | Docs site (Astro + Starlight). Private. |

Core source, under `packages/core/src/`:

- `api/` — `createChart()`
- `chart/` — chart class, options, pane layout, theme, a11y
- `render/` — layered canvases, frame scheduler
- `scales/` — index time scale, price scale, ticks
- `series/` — candlestick, bar, line, area, volume
- `data/` — columnar store, `DataSource`, feed
- `interaction/` — pan/zoom, crosshair, order-intent button
- `indicators/`, `annotations/`, `priceLines/`, `eventTags/`, `chrome/` — opt-in subpaths

The package entry (`src/index.ts`) is the engine, series, axes, and crosshair. Indicators, annotations, price lines, event tags, and chrome are subpath exports (`package.json` `exports`, `sideEffects: false`) and must stay out of that entry. A new indicator is its own module under `indicators/`, loaded with a dynamic `import()`. `@lightfin/react` is a sibling package, so the core never depends on React. A future Vue wrapper would follow that shape.

`ChartTheme` is the theme source of truth. Chrome's `themeVars()` derives CSS variables from it, one way.

## Rendering

Canvas2D only, stacked as absolutely positioned layers: background/grid, series, overlay (crosshair, price line, in-progress drawings), axis labels. A crosshair move repaints the overlay, not the series. Geometry is batched (one path and one fill/stroke per series or color), snapped to device pixels. All canvases are `clientWidth/Height * devicePixelRatio`, scaled with `ctx.scale(dpr)`.

`createChart()` is synchronous. It fills its container via `ResizeObserver` and never sets its own size. There is no width/height option and no live option setter: options apply at construction. In React, a new `key` recreates the chart.

One `requestAnimationFrame` scheduler coalesces dirty layers into a single paint per frame.

## Time, price, and data

The X axis is index-based: uniform bar spacing, time is a label. That skips weekend and session gaps. Pan and zoom anchor on the pointer (the bar under the cursor stays fixed). Visible range is `{ fromIndex, barWidth }`.

`UTCTimestamp` is integer Unix seconds. Milliseconds are wrong. The public API takes `{ time, open, high, low, close, volume? }` objects. Internally the store is columnar typed arrays with headroom at both ends and a `baseIndex`. Appends and prepends are amortized O(1), and a logical index stays tied to the same bar for its life (backfill decrements `baseIndex` instead of renumbering). Indicator caches and anything index-keyed depend on that. Drawings are anchored by time and price, not index, and use `timeToCoordinate()` so they survive backfill and interval changes.

Zoom-out stops at a 0.5px minimum bar width, so a frame draws about two bars per pixel and paint cost tracks screen width. Sub-pixel min/max decimation was measured on the stress page and rejected: below that floor candles read as a smear, and long ranges are a coarser interval the host selects. Revisit only if a host must show an entire fine-interval history at once.

`DataSource.getBars` is count-based (`count` bars before `before`), not a time window — a time range across a gap comes back empty and looks like the start of history. The chart asks for a screen of the newest bars, keeps a screen of history to the left, and follows a short page with another. `[]` is the start of history. One request at a time; it is aborted only when the source is replaced, `setData()` runs, or the chart is removed. Failures back off. Live bars that arrive before the first page are held and merged after it; live bars older than the last bar are dropped. History grows left, live bars grow right. Healing a dropped websocket is the adapter's job.

`series.update` with the same time mutates the last bar; a new time appends. Follow-mode (on by default) shifts the viewport when pinned to the live edge, and turns off when the user pans into history.

The price scale autoscales to the visible range. Each indicator pane has its own scale. Volume is a histogram in the bottom slice of the main pane on a hidden scale, not an axis.

## Indicators

Plain TypeScript against the small runtime API. No Pine Script clone and no custom language.

Incremental calc is required. `calculateAll` runs on reset or backfill; `update` / `updateLast` handles a live bar from prior outputs in O(1) or O(window). Pan and zoom only slice the cache. Calc stays on the main thread. Built-ins share one `computeAt` path so the incremental result matches a full recompute.

Default plot colors come from `ChartTheme.indicatorPalette`. An explicit color in the caller's options wins. `setOptions` keeps the already-resolved color.

## Interaction and chrome

Pointer Events only. Touch: a drag pans; a 400ms press-and-hold starts the crosshair, which stays up after lift so the order button can be tapped.

The order "+" button and event tags draw a marker and report a click. They do not render a form or a card.

Annotations plug in through `chart.attachPrimitive()` (draw callbacks plus pointer hooks that can claim a press). Committed drawings paint on the series layer; the selection and anything in progress paint on the overlay. Tool variants (ray, extended line, arrow, highlighter, marker shape) are style presets on an existing type, not new types. Undo/redo, lock, hide, and z-order already exist. `group` tags who placed a drawing; `replace(group, drawings)` swaps that group in one change. Model output is untrusted: `add` / `load` / `replace` / `update` validate and throw a message that names each bad field, all-or-nothing, and `validateAnnotation()` runs the same checks without throwing.

Chrome (`@lightfin/core/chrome`) is optional DOM on top of the canvases. It takes an annotations instance as an argument and does not import annotation code itself. The host supplies the interval list and reloads bars on change.

Keyboard focus is a `role="group"` on the chart element, with a focus ring drawn on the overlay canvas (a CSS outline would sit under the canvases). There is no hidden data table of every loaded bar.

## React

`@lightfin/react` only binds the imperative chart to React's lifecycle. Features are not reimplemented as components. Event props are ref-latched (subscribed once, always calling the latest prop). `useChartEffect` is how a child wires series, indicators, chrome, annotations, or price lines.

## Tests and bundle size

Vitest for pure logic (scales, ticks, indicator incremental-vs-batch equivalence). Playwright (`bun run test:e2e`) drives `/demo?feed=mock&live=0` with real pointer and keyboard input and asserts through the public API (`paneLayout()`, `timeScale()`, events), not pixels. Font rendering differs between macOS and Linux CI, so there are no screenshot baselines.

`/demo` is the manual playground (Binance BTC/USDT, or `?feed=mock` and `?live=0`). `demo/stress.html` loads 500k 1m bars and reports ingest, calc, backfill, and paint times.

Bundle size is gated by `size-limit` (`bun run size`, per-package `.size-limit.json`) with about 10% headroom. Raising a budget is a deliberate change. A new subpath needs an entry in the core Vite build and, when it has weight, in the size budget. `bun run size:json` rewrites `packages/core/size.json` and `packages/react/size.json` from those checks (brotli bytes). The landing page reads them at build time; CI fails if the committed files drift.

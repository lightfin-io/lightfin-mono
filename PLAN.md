# lightfin-web-chart — Project Plan

## 1. Vision

A web financial-charting library matching TradingView's core charting experience
(candlesticks, line, area, bar, volume, indicators, drawing tools, smooth
pan/zoom, live data) while staying smaller, dependency-free, and easy to wire to
any data source. Framework-agnostic vanilla-TS core, Canvas2D rendering (geometry
and text) in layered canvases, tree-shakeable.

**Not goals:** pixel-cloning TradingView, a backtesting engine, a trading/execution
UI, or a hosted data service. It's a rendering + interaction library: bars in,
chart out. It provides the _hook_ a trading UI needs (§8.2) — fires price/coords,
host renders the order form.

## 2. Current state

Phases 0–8 shipped: cleanup/scaffold, core rendering (candlesticks, index
time axis, price axis, pan/zoom, resize), crosshair + current-price line, volume
sub-pane, interval-aware time ticks, live data (update/follow-mode/DataSource +
history backfill), the indicator framework with SMA, EMA, Bollinger, RSI,
MACD, Volume MA, candlestick/bar/line/area series switchable in place via
`setChartType()`, the `/chrome` widgets (instrument metadata + timezone,
HUD/legend, indicator rows, top/bottom/left toolbars, go-to modal, exchange
clock), the `/annotations` drawing tools (trendline, h/v line, rectangle, fib,
text) on a generic primitive hook, the order-intent "+" hook, magnet crosshair
mode, the 500k-candle stress page, and a bundle-size budget in CI. Decimation
and worker-based calc were measured and deliberately not built (§6, §8.4).
See §13; ecosystem work (React wrapper, theming, docs) is parked in §14.

## 3. Core technical decisions

| Decision           | Choice                                                                                                                                                                                                                                                                                                                                                |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rendering          | **Canvas2D for everything** (geometry + text), stacked as layered `<canvas>`. The 0.5px minimum bar width (§6) caps draw count at ~2 bars per pixel, so GPU isn't needed; Canvas2D is synchronous, universal, deterministic in headless CI. Renderer stays behind an interface so WebGL can be added later if a benchmark proves it's the bottleneck. |
| X-axis model       | **Index-based** (uniform bar spacing); time is a per-index label, not a continuous axis. Skips weekend/overnight gaps for free, integer-friendly panning.                                                                                                                                                                                             |
| Language           | TypeScript, **zero runtime dependencies**.                                                                                                                                                                                                                                                                                                            |
| Framework bindings | None in core; thin React/Vue wrappers as separate optional packages later.                                                                                                                                                                                                                                                                            |
| Scripting          | Indicators are plain TS/JS against a small API; **no** Pine Script clone or custom DSL (§8.4).                                                                                                                                                                                                                                                        |

## 4. Module layout

```
src/
  chart/        Chart class, container sizing/resize-observer, pane layout, theming
  render/       Canvas layer manager, draw primitives, devicePixelRatio handling
  scales/       Time scale (index<->pixel, interval/tick selection), price scale(s)
  series/       Candlestick, line, area, bar, histogram (volume) renderers
  data/         Bar/series store, DataSource adapter interface
  interaction/  Pointer handling, pan/zoom/inertia, crosshair, hit-testing
  indicators/   Indicator runtime + built-ins (dynamically importable, §8.4)
  annotations/  Drawing tools (dynamically importable, §8.5)
  priceLines/   Host-managed order/position lines (§8.2)
  chrome/       Optional DOM widgets: HUD/legend, toolbars, date modal (§9)
  api/          Public entry assembling the above into createChart()
  index.ts      Package entry — re-exports the minimal "core" surface only
```

`indicators/`, `annotations/`, `priceLines/`, `chrome/` are subpath exports (§10).

## 5. Rendering engine

- **Layered canvases**, each absolutely-positioned in a stack, so a crosshair move
  never repaints candles and a candle redraw never repaints the grid:
  1. **Background/grid** — redrawn on resize / scale change only.
  2. **Series** — candles, volume, indicator overlays/panes; redrawn on data or
     viewport change, using batched-path drawing (§9).
  3. **Overlay geometry** — crosshair, current-price line, annotations in flight;
     redrawn every pointer move, cheap by construction.
  4. **Overlay text** — crosshair labels, order "+" button, annotation text.
  5. **Axis labels** — time strip + per-pane price strips.
- `createChart()` is a **plain synchronous constructor** — no async device init,
  no "unsupported" state, no context-loss recovery.
- All canvases sized to `clientW/H * devicePixelRatio`, scaled via `ctx.scale(dpr)`.
  Resize via `ResizeObserver`; the chart never sets its own size, only matches the
  container.
- **Single rAF-batched invalidation scheduler**: dirty layers coalesce into one
  paint per frame.

## 6. Data model & zoom-out limit

- **Bar shape:** `{ time: UTCTimestamp, open, high, low, close, volume? }` where
  `UTCTimestamp` = **integer Unix seconds UTC**. A `BusinessDay` variant for daily
  data can come later; seconds is v1 canonical.
- **Public API takes the object array; internal storage is columnar.**
  `setData(bars)` transforms once on ingest into time-sorted typed-array columns
  (`times[]`, `opens[]`, …). `update(bar)` appends a single object. Binary search
  over `times[]` for time→index. Optional `setColumns({...})` fast-path later if a
  benchmark shows ingest is a bottleneck.
- **Bidirectional growth + stable indices:** data grows at both ends (live append,
  backfill prepend). Use **gap-buffer columns (headroom both ends) + a `baseIndex`
  offset** so appends/prepends are O(1) amortized and a logical index stays bound
  to the same bar for its lifetime (backfill decrements `baseIndex` instead of
  renumbering) — keeps index-keyed annotations/indicator caches correct.
- **No decimation — a 0.5px minimum bar width instead.** The zoom-out floor caps
  a frame at ~2 bars per pixel (~3k bars on a 1500px plot), so paint cost is
  bounded by screen width, not data size. Measured on the stress page
  (1920×1080 @2×, 500k bars, six indicators): ~2ms per full paint at 0.5px.
  Below the floor, cost grows with visible bars: 8ms at 0.1px, 40ms at 0.02px,
  300ms with all 500k on screen. Going lower would need per-pixel min/max
  decimation of every series, volume, and indicator plot, plus a
  multi-resolution min/max cache so autoscale doesn't scan every visible bar.
  Not worth it: sub-0.5px candles read as a smeared envelope, and TradingView
  covers long ranges by switching to a coarser interval, which hosts do here
  through the interval selector. Revisit only if a host needs a whole-history
  overview at a fine interval.
- **Instrument / exchange metadata** travels with the data so the HUD/axes/time can
  display it (§9):
  ```ts
  interface InstrumentInfo {
    symbol: string // "BTCUSD"
    name?: string // "Bitcoin / US Dollar"
    marketId?: string // host's market/instrument identifier
    exchange?: string // display name, "BINANCE"
    timezone?: string // IANA tz, "America/New_York" — drives exchange-local clock
    pricePrecision?: number // decimals for price labels/HUD
  }
  ```
  Set via `chart.setInstrument(info)`. Exchange-local time is derived from
  `timezone` with `Intl.DateTimeFormat` (no deps).
- **DataSource interface** (opt-in; `setData` covers the static case directly):
  ```ts
  interface DataSource {
    getBars(range: { from: number; to: number }): Promise<Bar[]> | Bar[]
    subscribeLive?(onBar: (bar: Bar, isNewBar: boolean) => void): () => void
  }
  ```
  Interface only: no built-in REST/websocket adapters. Wiring an exchange
  API is a few lines of host code, and shipping adapters would mean tracking
  every vendor's API.

## 7. Time & price axes

- **Time axis:** pick a "nice" tick interval from a ladder
  (1s/5s/15s/30s, 1m/5m/15m/30m, 1H/2H/4H, 1D/1W/1M/1Y) by target pixel-per-label
  density; index-based so it skips gaps. Label format adapts to interval. Ticks
  render in the instrument timezone (§6).
- **Price axis:** autoscale to visible min/max with margin. The main pane and
  each indicator sub-pane have their own right-side scale; a second (left)
  scale per pane isn't built (§15).
- **Volume sub-scale:** histogram in the bottom ~15–20% of the main pane on its own
  hidden scale (0 → max visible volume × margin), not shown as an axis.

## 8. Interaction

### 8.1 Pan / zoom

- Pointer Events only (`pointerdown/move/up/cancel`) — mouse, touch, pen in one path.
- Drag = pan; wheel/pinch = zoom, both **anchored on the pointer** (bar under
  cursor/centroid stays fixed).
- Visible range = `{ fromIndex, barWidth }` with fractional offset for sub-bar
  panning; clamped, with configurable right-side empty space.

### 8.2 Crosshair & order hook

- Pointer move updates only the overlay layer: dotted cross-lines through the
  nearest bar + time/price axis labels.
- **Touch:** a drag pans, so the crosshair comes from press-and-hold — a
  finger held still for 400ms stops panning and drags the crosshair. It stays
  up after lifting (so the "+" button can be tapped) until the next tap.
- **Magnet mode** (snap to OHLC; close for line/area) — opt-in via
  `crosshairMode: 'magnet'` / `chart.setCrosshairMode()`.
- **Order-intent hook** (opt-in, off by default): a "+" button at the price-axis
  gutter fires a callback; we own only the button, host renders any order form.
  The button shows only while a handler is registered, rides the price-pane
  crosshair line, and claims its pointerdown so clicking it never pans.
  ```ts
  interface OrderIntentEvent {
    price: number
    time: UTCTimestamp | null
    index: number
    paneId: string
    point: { x: number; y: number }
    clientPoint: { x: number; y: number }
  }
  chart.onOrderIntent(e => {
    /* host renders its own form */
  })
  ```
- **Price lines** (`/price-lines` subpath, on the primitive hook): host-managed
  horizontal lines for working orders, positions, or alerts — line style,
  title label at the pane's right edge, price badge on the axis. A
  `draggable` line follows the pointer and fires `drag` (the host may snap it
  via `setOptions({ price })`) and `dragEnd` (send the order update); the
  host owns the state and can move it back if the update is rejected.

### 8.3 Live last candle & current-price line

- `series.update(bar)`: same time → mutate last bar in place, redraw last candle +
  labels; new time → append and shift viewport if pinned to live edge (follow-mode,
  on by default).
- Current price line = dotted horizontal line + filled price-axis badge on the
  overlay layer, cheap per tick.

### 8.4 Indicators

- Two kinds: **overlay** (main pane, shared scale — MAs, Bollinger) and **pane**
  (own sub-pane + scale — RSI, MACD). Dragging the divider above a sub-pane
  resizes it against its upper neighbour; sub-panes keep ≥32px and the main
  pane ≥20% of the plot.
- **Incremental calc is a hard requirement:** compute full output once and cache;
  pan/zoom only slices + redraws, never recomputes; live bars do an O(1)/O(window)
  tail update. Contract: `calculateAll(bars)` + `update(bar)`.
- **Calc stays on the main thread (worker investigated, not built).** On the
  stress page the six built-ins compute over 500k bars in ~110ms total, once on
  load; live ticks are O(1). The only recurring cost is backfill, which
  recomputes over the full history: ~140ms after prepending 50k to 500k, a few
  ms at typical sizes (≤50k bars). A worker would need indicator code loadable
  by URL inside it (breaking plain-function and AI-authored indicators),
  copying the columns across (~24MB at 500k, or `SharedArrayBuffer`, which
  forces COOP/COEP headers on every host page), and an async cache that is
  stale between a data change and its result. If backfill hitches show up,
  cheaper levers come first: rolling-sum SMA/Bollinger/Volume MA (they re-scan
  their window per bar) and time-sliced recompute.
- **Extensibility:** plain TS/JS functions against a small runtime API
  (`ta.sma()`, `ta.ema()`, `ta.rsi()`, series accessors), each a dynamically
  importable module. Built-ins: SMA, EMA, RSI, MACD, Bollinger, Volume MA (an
  overlay on the hidden volume scale, `scale: 'volume'`).
- **AI-friendly:** an AI-driven UI can dynamically add existing or author new
  indicators.
- **JS/TS is the indicator language — no custom DSL.** No Pine Script clone
  (proprietary/trademarked, legal risk) and no Pine-inspired language of our
  own either: plain TS/JS needs no parser or runtime, gets real tooling and
  types for free, and is what AI authors write best.

### 8.5 Annotations

- Drawing tools (trendline, h/v line, rectangle, fib retracement, text) in the
  `/annotations` subpath, independent of indicators. They plug into the core
  through a generic **primitive** hook (`chart.attachPrimitive()`): draw
  callbacks on the series and overlay layers plus pointer hooks that can claim
  a press (so it doesn't pan). The core carries no annotation code.
- **Anchored by time + price**, not index: `chart.timeToCoordinate()`
  interpolates between bars and extrapolates past either end, so drawings hold
  across backfill, interval switches, and into the right-offset space.
- Committed drawings paint on the series layer; the selected one and any in
  progress paint on the overlay, so dragging never repaints the rest.
- Pick a tool, then drag or click twice (one click for h/v line and text).
  Points snap to bar times and follow magnet mode. Select to drag the body
  (whole bars, free in price) or a handle; Delete removes, Escape cancels;
  double-click edits text in place. The tool reverts to the cursor after
  each drawing.
- Serializable to plain JSON (`{ id, type, points: [{ time, price }], style,
text? }`) via `toJSON()` / `load()`; a `change` event (once per edit, not
  mid-drag) tells the host when to persist — persistence itself is the host's job.

## 9. Chart chrome / UI widgets

Optional DOM widgets rendered inside the chart container, driven by chart state +
events. Subpath-exported and tree-shakeable (`lightfin-web-chart/chrome`) so
headless/embedded charts pay nothing and hosts can swap their own. All are
theme-aware and overlay the canvas stack.

- **Top-left HUD (legend):**
  - Instrument line: `name`/`symbol`, `exchange`, active interval, chart type, and
    the **exchange-local clock** (live, ticking, in instrument timezone).
  - OHLCV readout next to it: O/H/L/C (up/down colored), change + change%, and
    volume — for the **hovered bar** when the crosshair is active, falling back to
    the **last bar** otherwise.
- **Indicator/volume HUD (below the legend):** one row per active indicator — name,
  params, color swatch, current/hovered values, and show-hide / remove controls;
  plus the hovered/last volume value.
- **Top toolbar:** interval selector, indicators menu (add/configure), and
  **chart-type selector** (candlestick / line / area / bar). (Symbol search is
  host-supplied.)
- **Bottom toolbar:** quick date-range buttons (1D, 5D, 1M, 3M, 6M, YTD, 1Y, 5Y,
  All), a **custom date / range** button opening a date-picker modal, and the
  exchange-local time.
- **Left annotation toolbar:** vertical strip of drawing tools (cursor, trendline,
  h/v line, rectangle, fib, text, clear) wired to §8.5; shown only when the host
  passes an annotations instance (`createChrome(chart, { annotations })`), so
  chrome never imports annotation code itself.

## 10. Bundle size & modularity

- **Core export** = chart engine + candlestick/line/area/bar/volume series +
  time/price axes + crosshair + pan/zoom. Everything else is opt-in.
- **Subpath exports**, each dynamically importable: `/indicators` (and
  per-indicator), `/annotations`, `/price-lines`, `/chrome`, future `/react`.
- `package.json` `exports` map + `sideEffects: false` for tree-shaking.
- Bundle size is budgeted in CI with `size-limit` (`.size-limit.json`, `bun run
size`): core, chrome, annotations, price lines, one indicator, all
  indicators, and everything together, each with ~10% headroom. Raising a budget is a deliberate, reviewed change.

## 11. Public API sketch

```ts
const chart = createChart(container, {/* theme, rightOffset, ... */}) // synchronous

chart.setInstrument({ symbol: 'BTCUSD', exchange: 'BINANCE', timezone: 'UTC' })

const candles = chart.addCandlestickSeries() // or addLineSeries / addAreaSeries / addBarSeries
candles.setData(bars) // static
candles.update(bar) // live tick / new bar
candles.setChartType('line') // switch render type on the same series

const volume = chart.addHistogramSeries({ pane: 'overlay-hidden-scale' })
volume.setData(volumeBars)

const sma = await chart.addIndicator(
  import('lightfin-web-chart/indicators/sma'),
  { period: 20 },
)
sma.setOptions({ period: 50 })
sma.setVisible(false)
sma.remove()
chart.indicators() // handles: name, params, plots, value(key, index)

chart.fitContent()
await chart.setVisibleTimeRange({ from, to }) // backfills older history first
await chart.scrollToTime(time)
chart.on('crosshairMove', e => {
  /* e?.index, e?.time */
}) // + dataChange, indicatorsChange, layoutChange, …
chart.onOrderIntent(e => openMyOrderForm(e.price, e.clientPoint)) // §8.2

// Working orders/positions (§8.2), from 'lightfin-web-chart/price-lines'.
const order = addPriceLine(chart, {
  price,
  title: 'Limit 1.0',
  draggable: true,
})
order.on('dragEnd', price => modifyOrder(id, price))

// Drawing tools (§8.5), from 'lightfin-web-chart/annotations'.
const drawings = createAnnotations(chart)
drawings.load(saved)
drawings.on('change', () => save(drawings.toJSON()))
drawings.setTool('trendline') // or let the left toolbar do it

// Optional widgets (§9); the host owns intervals and reloads bars on change.
const chrome = createChrome(chart, {
  intervals: ['1m', '1H', '1D'],
  interval: '1m',
  onIntervalChange,
  annotations: drawings, // adds the left drawing toolbar
})

// Custom drawing/interaction on the main pane — what annotations build on.
chart.attachPrimitive({
  draw(ctx, { pane }) {
    /* … */
  },
  pointerDown(e) {
    /* … */
  },
})
```

Container sizing is implicit — no `width`/`height` option.

## 12. Testing

- **Vitest** for pure logic: tick/interval selection, scale math, indicator
  incremental-vs-batch equivalence.
- **Playwright** against `/demo`: pan, zoom, crosshair, resize, touch gestures,
  screenshot diffing (CPU-rendered Canvas2D → deterministic, no GPU flags; small
  pixel tolerance for font/AA).
- `/demo` is both manual QA playground and the Playwright target; runs static JSON
  fixtures + a mock live feed.
- `/demo/stress.html` loads 500k 1m bars (`?bars=N` to change) with the demo's
  indicators and reports ingest, calc, backfill, and per-frame paint times, with
  scripted pan / zoom / live-tick / backfill benchmarks.

## 13. Phased roadmap

0. **Cleanup & scaffolding** — ✅
1. **Core rendering** — candlesticks, index time axis, price axis, pan/zoom, resize. ✅
2. **Single-pane polish** — crosshair, current-price line, volume sub-pane, smart ticks. ✅
3. **Live data** — update/follow-mode, DataSource, mock feed, backfill. ✅
4. **Indicators framework** — overlay + pane, incremental calc, 5 built-ins. ✅
5. **Series types & chart-type switching** — line, area, bar renderers; `setChartType()`; Volume MA. ✅
6. **Chart chrome** — instrument/exchange metadata, top-left HUD + OHLCV, indicator/volume HUD, top toolbar (interval/indicators/chart type), bottom toolbar (date ranges + custom-date modal + exchange clock). ✅ (left annotation toolbar moves to Phase 7)
7. **Annotations** — drawing tools, hit-testing, selection/drag, JSON serialization, left annotation toolbar. ✅
8. **Scale-out perf** — 500k-candle stress page, bundle-size budget in CI, order-intent hook + magnet mode. ✅ Decimation and worker-based calc were measured and not built (§6, §8.4).

## 14. Don't pick up yet

- Connect demo to real datasource e.g. Binance BTC-USD
- Tradingview has tags that show events for example has E tags along the bottom of the price chart which when clicked open an earnings modal.
- Settings modal, saving annotations, reset to defaults etc
- **Ecosystem** — React wrapper (first), theming system, docs site. Theming
  open question: today the canvas takes a JS `theme` object and chrome mirrors
  it into CSS variables; decide whether CSS variables become the source of truth.
- Achieve approximate feature parity of annotations with TradingView e.g. more tools, and tools get popover menus with customizations (e.g. text font, style, and color)

## 15. Open questions

- **Date locale** — axis/crosshair month names are English and the clock is
  24h `en-GB`; numbers go through `priceFormatter`. A `locale` option would
  route dates through `Intl.DateTimeFormat` too.
- **Left price scale** — a second scale per pane (e.g. comparing two symbols).
- **Accessibility** — canvas is invisible to AT. Baseline: `aria-label`/described
  container + optional hidden data-table; keyboard pan/zoom/crosshair nice-to-have.
  Decide before calling v1 "done".- **WebGL backend** — only if a real benchmark hits a wall (many panes/series at high DPR is the likely trigger, not raw candle count). WebGL, not WebGPU.

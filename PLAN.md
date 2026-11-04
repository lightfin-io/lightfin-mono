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

Phases 0–5 shipped: cleanup/scaffold, core rendering (candlesticks, index time
axis, price axis, pan/zoom, resize), crosshair + current-price line, volume
sub-pane, interval-aware time ticks, live data (update/follow-mode/DataSource +
history backfill), the indicator framework with SMA, EMA, Bollinger, RSI,
MACD, Volume MA, and candlestick/bar/line/area series switchable in place via
`setChartType()`. See §13 for what remains.

## 3. Core technical decisions

| Decision | Choice |
| --- | --- |
| Rendering | **Canvas2D for everything** (geometry + text), stacked as layered `<canvas>`. Decimation (§6) caps draw count at ~pixel-width, so GPU isn't needed; Canvas2D is synchronous, universal, deterministic in headless CI. Renderer stays behind an interface so WebGL can be added later if a benchmark proves it's the bottleneck. |
| X-axis model | **Index-based** (uniform bar spacing); time is a per-index label, not a continuous axis. Skips weekend/overnight gaps for free, integer-friendly panning. |
| Language | TypeScript, **zero runtime dependencies**. |
| Framework bindings | None in core; thin React/Vue wrappers as separate optional packages later. |
| Scripting | Build our own small TS/JS indicator API, **not** a Pine Script clone (legal risk, §8.4). |

## 4. Module layout

```
src/
  chart/        Chart class, container sizing/resize-observer, pane layout, theming
  render/       Canvas layer manager, draw primitives, devicePixelRatio handling
  scales/       Time scale (index<->pixel, interval/tick selection), price scale(s)
  series/       Candlestick, line, area, bar, histogram (volume) renderers
  data/         Bar/series store, DataSource adapter interface, decimation/LOD cache
  interaction/  Pointer handling, pan/zoom/inertia, crosshair, hit-testing
  indicators/   Indicator runtime + built-ins (dynamically importable, §8.4)
  annotations/  Drawing tools (dynamically importable, §8.5)
  chrome/       Optional DOM widgets: HUD/legend, toolbars, date modal (§9)
  api/          Public entry assembling the above into createChart()
  index.ts      Package entry — re-exports the minimal "core" surface only
```

`indicators/`, `annotations/`, `chrome/` are subpath exports (§10).

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

## 6. Data model & decimation

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
- **Decimation:** above ~1 bar/pixel, aggregate per pixel bucket with a **min/max
  envelope** (open of first bar, close of last, min(low)/max(high)) — not LTTB, so
  wicks survive zoom-out. For line/area, emit per-pixel-column min & max y.
- **Multi-resolution cache:** lazily precompute decimated levels (mipmap-style,
  keyed by zoom bucket); extend incrementally as bars stream, don't rescan.
- **Instrument / exchange metadata** travels with the data so the HUD/axes/time can
  display it (§9):
  ```ts
  interface InstrumentInfo {
    symbol: string          // "BTCUSD"
    name?: string           // "Bitcoin / US Dollar"
    marketId?: string       // host's market/instrument identifier
    exchange?: string       // display name, "BINANCE"
    timezone?: string       // IANA tz, "America/New_York" — drives exchange-local clock
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

## 7. Time & price axes

- **Time axis:** pick a "nice" tick interval from a ladder
  (1s/5s/15s/30s, 1m/5m/15m/30m, 1H/2H/4H, 1D/1W/1M/1Y) by target pixel-per-label
  density; index-based so it skips gaps. Label format adapts to interval. Ticks
  render in the instrument timezone (§6).
- **Price axis:** autoscale to visible min/max with margin; multiple scales per
  pane (left/right) and multiple panes supported.
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
- Pointer move (press-hold on touch) updates only the overlay layer: dotted
  cross-lines through the nearest bar + time/price axis labels.
- **Magnet mode** (snap to OHLC) — opt-in, not v1-blocking.
- **Order-intent hook** (opt-in, off by default): a "+" button at the price-axis
  gutter fires a callback; we own only the button, host renders any order form.
  ```ts
  interface OrderIntentEvent {
    price: number; time: UTCTimestamp | null; index: number; paneId: string
    point: { x: number; y: number }; clientPoint: { x: number; y: number }
  }
  chart.onOrderIntent(e => { /* host renders its own form */ })
  ```
  Draggable order/position price-line primitive is a later follow-on (§14).

### 8.3 Live last candle & current-price line
- `series.update(bar)`: same time → mutate last bar in place, redraw last candle +
  labels; new time → append and shift viewport if pinned to live edge (follow-mode,
  on by default).
- Current price line = dotted horizontal line + filled price-axis badge on the
  overlay layer, cheap per tick.

### 8.4 Indicators
- Two kinds: **overlay** (main pane, shared scale — MAs, Bollinger) and **pane**
  (own sub-pane + scale, resizable drag handle — RSI, MACD).
- **Incremental calc is a hard requirement:** compute full output once and cache;
  pan/zoom only slices + redraws, never recomputes; live bars do an O(1)/O(window)
  tail update. Contract: `calculateAll(bars)` + `update(bar)`.
- **Extensibility:** plain TS/JS functions against a small runtime API
  (`ta.sma()`, `ta.ema()`, `ta.rsi()`, series accessors), each a dynamically
  importable module. Built-ins: SMA, EMA, RSI, MACD, Bollinger, Volume MA (an
  overlay on the hidden volume scale, `scale: 'volume'`).
- **AI-friendly:** an AI-driven UI can dynamically add existing or author new
  indicators.
- **No Pine Script clone** (proprietary/trademarked, legal risk). A TS/JS API gets
  ~90% of the value. An original Pine-inspired DSL is a Phase 9+ stretch.

### 8.5 Annotations
- Drawing tools (trendline, h/v line, rectangle, fib, text) as their own
  interaction + overlay layer, independent of indicators.
- Hit-testing for select/drag/delete; serializable to JSON
  (`{ type, points, style }`) for host persistence (persistence itself is host's job).

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
  h/v line, rectangle, fib, text, clear) wired to §8.5; shown only when annotations
  are loaded.

## 10. Bundle size & modularity

- **Core export** = chart engine + candlestick/line/area/bar/volume series +
  time/price axes + crosshair + pan/zoom. Everything else is opt-in.
- **Subpath exports**, each dynamically importable: `/indicators` (maybe
  per-indicator), `/annotations`, `/chrome`, future `/react`.
- `package.json` `exports` map + `sideEffects: false` for tree-shaking.
- Track bundle size in CI (`size-limit`) once there's a core to measure.

## 11. Public API sketch

```ts
const chart = createChart(container, { /* theme, rightOffset, ... */ }) // synchronous

chart.setInstrument({ symbol: 'BTCUSD', exchange: 'BINANCE', timezone: 'UTC' })

const candles = chart.addCandlestickSeries() // or addLineSeries / addAreaSeries / addBarSeries
candles.setData(bars)   // static
candles.update(bar)     // live tick / new bar
candles.setChartType('line') // switch render type on the same series

const volume = chart.addHistogramSeries({ pane: 'overlay-hidden-scale' })
volume.setData(volumeBars)

const sma = await chart.addIndicator(import('lightfin-web-chart/indicators/sma'), { period: 20 })

chart.timeScale().fitContent()
chart.timeScale().setVisibleRange({ from, to })
chart.onOrderIntent(e => openMyOrderForm(e.price, e.clientPoint)) // §8.2
```

Container sizing is implicit — no `width`/`height` option.

## 12. Testing

- **Vitest** for pure logic: decimation/bucketing, tick/interval selection, scale
  math, indicator incremental-vs-batch equivalence.
- **Playwright** against `/demo`: pan, zoom, crosshair, resize, touch gestures,
  screenshot diffing (CPU-rendered Canvas2D → deterministic, no GPU flags; small
  pixel tolerance for font/AA).
- `/demo` is both manual QA playground and the Playwright target; runs static JSON
  fixtures + a mock live feed.

## 13. Phased roadmap

0. **Cleanup & scaffolding** — ✅
1. **Core rendering** — candlesticks, index time axis, price axis, pan/zoom, resize. ✅
2. **Single-pane polish** — crosshair, current-price line, volume sub-pane, smart ticks. ✅
3. **Live data** — update/follow-mode, DataSource, mock feed, backfill. ✅
4. **Indicators framework** — overlay + pane, incremental calc, 5 built-ins. ✅
5. **Series types & chart-type switching** — line, area, bar renderers; `setChartType()`; Volume MA. ✅
6. **Chart chrome** _(next)_ — instrument/exchange metadata, top-left HUD + OHLCV, indicator/volume HUD, top toolbar (interval/indicators/chart type), bottom toolbar (date ranges + custom-date modal + exchange clock), left annotation toolbar.
7. **Annotations** — drawing tools, hit-testing, selection/drag, JSON serialization.
8. **Scale-out perf** — decimation + multi-resolution cache, worker-based calc investigation, bundle-size budget in CI, 500k-candle stress page, order-intent hook + magnet mode.
9. **Ecosystem** — React wrapper (first), theming system, docs site, (stretch) original scripting DSL.

## 14. Open questions

- **Columnar store** — leaning typed/columnar (uPlot's headline win); confirm with a spike.
- **Tick-interval ladder & locale** — exact ladder + date/number locale handling; decide before chrome/axes work hardens.
- **Theming API** — CSS variables vs. JS options object; touches render + chrome layers.
- **Accessibility** — canvas is invisible to AT. Baseline: `aria-label`/described
  container + optional hidden data-table; keyboard pan/zoom/crosshair nice-to-have.
  Decide before calling v1 "done".
- **Order/position price-line primitive** — draggable, host-managed markers; Phase 8 follow-on to the order hook.
- **Built-in data adapters** — leaning interface-only for v1 (REST/websocket helpers stay user-land).
- **WebGL backend** — only if a real benchmark hits a wall (many panes/series at high DPR is the likely trigger, not raw candle count). WebGL, not WebGPU.

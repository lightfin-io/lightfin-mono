# lightfin-web-chart — Project Plan

## 1. Vision

A financial charting library for the web that matches TradingView's core charting
experience — candlesticks, area, line (and other types later), volume, indicators, drawing tools, smooth pan/zoom,
live data — while staying smaller, dependency-free, and easier to wire up to an
arbitrary data source. Framework-agnostic (vanilla TS core), HTML5 Canvas2D
rendering (geometry and text alike, in layered canvases — see §3/§5),
tree-shakeable so consumers only pay for the pieces they use.

**Not a goal:** cloning TradingView pixel-for-pixel, a backtesting engine, a
trading/execution UI, or a hosted data service. This is a rendering + interaction
library that takes bars in and draws a chart. We do, however, provide the
_hook_ a trading UI would need (see §8.2) — we fire an event with price/coords,
the host renders whatever order form it wants.

## 2. Current state / cleanup (Phase 0)

The repo is still the stock `vite --template vanilla-ts` scaffold. Before any
chart code lands:

- Delete template cruft: `src/counter.ts`, `src/assets/*`, the hero/demo markup
  in `src/main.ts`, template CSS in `src/style.css`.
- Restructure `src/` as the library itself (see §4), and move the Vite demo app
  that currently lives at the repo root into `/demo` (a thin app that imports
  the library from `src` via a path alias, used as our manual playground and
  eventually our visual test bed).
- Switch `vite.config` to library mode for `bun run build` (ESM + type
  declarations), keep a normal app-mode Vite config for `/demo`.
- **Declaration emit:** the repo is on TypeScript 7 (the native/`tsgo`
  compiler) + Vite 8. Confirm the native compiler (or `vite-plugin-dts`) can
  emit `.d.ts` for lib mode before relying on it; if `.d.ts` emit isn't ready
  on the native path yet, keep a `tsc`-based declaration-only step as a
  fallback. This is a dev-time dependency and doesn't violate the
  zero-_runtime_-deps rule.
- Init git (`git init`), add an initial commit of the cleaned scaffold.
- Add Vitest for unit tests, keep Prettier (already configured).
- **Toolchain is Bun** (there's a `bun.lock`, no `package-lock.json`): use
  `bun install` / `bun run <script>` / `bunx` throughout, not npm. Scripts in
  this doc are written accordingly.
- Decide package `exports` map up front (see §10) since restructuring it later
  is a breaking change.

## 3. Core technical decisions

| Decision           | Choice                                                                                          | Why                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------ | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rendering          | **Canvas2D for everything** (geometry _and_ text), stacked as layered `<canvas>` elements       | Decimation (§6) caps the on-screen draw count at ~pixel-width regardless of dataset size, so GPU instancing solves a problem we don't actually have. Canvas2D is one API for geometry and text, needs no shaders/buffers/device-loss/async-init, runs everywhere (no "unsupported" state), and is the most deterministic to test in headless CI. It's also what TradingView's own charts use (see note below). Renderer stays behind an interface so a WebGL backend can be added _later_ if a real `/demo` benchmark proves Canvas2D is the bottleneck (§9) — WebGL, not WebGPU, since its perf class is equivalent for 2D while its browser reach and testability are far better. |
| X-axis model       | Index-based (uniform bar spacing), time is a label mapped per index, not a continuous time axis | Naturally skips weekends/overnight gaps, makes panning math integer-friendly, and matches how TradingView/lightweight-charts avoid "dead space" on non-trading days.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Language           | TypeScript, zero runtime dependencies                                                           | "Lightweight" is a stated goal; every dependency is bundle weight someone didn't ask for.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Framework bindings | None in core; thin React/Vue wrappers as separate optional packages later                       | Core must stay usable from plain JS/TS.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Scripting language | Build our own small indicator API/DSL, not a Pine Script clone                                  | See §8.4 — legal risk, not worth it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |

**Note — does TradingView really use Canvas?** Yes. Not just lightweight-charts
(open-source, explicitly "built with HTML5 Canvas") — the full **Advanced
Charts / Charting Library** product and the main tradingview.com charts are
HTML5 Canvas too, drawing price bars as pixels directly rather than via DOM/SVG.
The whole category (TradingView, uPlot, Chart.js, ECharts) converged on Canvas2D
for time-series precisely because DOM/SVG chokes past ~10k nodes while Canvas
doesn't. That's strong prior art that a Canvas2D core is the right default here,
and that the ceiling is high if we keep the pipeline disciplined (§9).

## 4. Module layout

```
src/
  chart/        Chart class, container sizing/resize-observer, pane layout, theming
  render/       Canvas layer manager, draw primitives, devicePixelRatio handling
  scales/       Time scale (index<->pixel, interval/tick selection), price scale(s)
  series/       Candlestick, line, area, bar, histogram (volume) renderers
  data/         Bar/series data store, data-source adapter interface, decimation/LOD cache
  interaction/  Pointer event handling, pan/zoom/inertia, crosshair, hit-testing
  indicators/   Indicator runtime + built-ins (dynamically importable, see §8)
  annotations/  Drawing tools (trendline, hline, rect, fib, text) (dynamically importable)
  api/          Public entry point(s) that assemble the above into `createChart()`
  index.ts      Package entry — re-exports the minimal "core" surface only
```

Each top-level folder is also a candidate subpath export (`lightfin-web-chart/indicators`,
`lightfin-web-chart/annotations`) — see §10.

## 5. Rendering engine

- **Layered surfaces**, each an absolutely-positioned `<canvas>` in a stack
  (all Canvas2D), so a crosshair move never repaints candles and a candle
  redraw never repaints the static grid:
  1. **Background/grid** — gridlines, pane backgrounds. Redrawn on resize or
     scale change only.
  2. **Series** — candles, volume histogram, indicator overlays/panes.
     Redrawn on data change or viewport (pan/zoom) change. Drawn with the
     batched-path techniques in §9 (one `Path2D`/stroke per series, one
     segment per x-pixel) so dense data stays cheap.
  3. **Overlay geometry** — dotted crosshair lines, current-price line,
     annotations being drawn/dragged. Redrawn on every pointer move; cheap by
     construction.
  4. **Overlay text** — crosshair price/time labels, the order "+" button
     (§8.2), annotation text — composited directly above layer 3.
  5. **Axis labels** — time axis strip + price axis strip per pane, separate
     surface so label text redraw doesn't touch chart content.
     Transparent layers composite naturally (each canvas clears to transparent
     except the background), so text and overlays sit cleanly over the series.
- **No GPU, no device lifecycle, no async init:** Canvas2D is available
  synchronously in every target browser, so `createChart()` is a plain
  synchronous constructor — no `whenReady()`, no "unsupported" state, no
  context-loss recovery to write. (A future WebGL backend would reintroduce
  context-loss handling; that's deferred with the backend itself.)
- All canvases sized to `container.clientWidth/Height * devicePixelRatio`,
  scaled via `ctx.scale(dpr, dpr)`. Resize via `ResizeObserver` on the
  container — the chart **never** sets its own width/height, it only ever
  matches the container (per the "responsive" requirement).
- A single `requestAnimationFrame`-batched invalidation scheduler: anything
  that wants to redraw a layer marks it dirty; one rAF tick redraws exactly
  the dirty layers, so rapid pan/zoom/live-tick events coalesce into one
  paint per frame instead of N.

## 6. Data & decimation

- **Bar shape:** `{ time: UTCTimestamp, open, high, low, close, volume? }`,
  where **`UTCTimestamp` = integer Unix seconds UTC** (matches
  lightweight-charts; pin the unit now because it leaks into every scale/axis/
  adapter — don't leave "seconds vs ms" ambiguous). A `BusinessDay`-style
  `{ year, month, day }` variant for pure daily data can come later; seconds
  is the v1 canonical form.
  **Public API takes this object shape; internal storage is columnar.** The
  `Bar` object array is purely the ergonomic boundary — `setData(bars)` accepts
  the familiar `{time,open,high,low,close,volume}[]` everyone already has, and
  we transform it **once on ingest** into time-sorted **typed-array columns**
  (`times[]`, `opens[]`, …) for GC/cache reasons (see §9). The user never sees
  columnar and pays nothing in convenience; the O(N) ingest transform is
  negligible next to the per-frame and GC savings it unlocks. `update(bar)`
  still takes a single object and appends into the columns (amortized capacity
  growth). Binary search over `times[]` for time→index lookups. A columnar
  fast-path (`setColumns({times, opens, …})`) for consumers whose data is
  already columnar (Arrow / binary feed / WASM) is an optional later addition,
  only if a benchmark shows the ingest transform itself is a bottleneck.
- **Data store growth (bidirectional) & index stability.** Data grows at _both_
  ends: live bars append to the back (newest), backfill from panning left
  prepends to the front (oldest). Two things make naive growth bad:
  - A typed-array prepend is an O(N) copy of the whole column every backfill.
  - Worse for our **index-based X axis** (§3): prepending renumbers every
    existing bar, so `{fromIndex}` (§8.1) and anything keyed by index —
    annotations (§8.5), indicator caches (§8.4) — would silently point at the
    wrong bar.

  Design: **gap-buffer-style columns (headroom at both ends) + a logical base
  index.** Each column is allocated larger than its data with free space at
  front and back; appends fill the back and backfill prepends fill the front,
  both **O(1) amortized, zero-copy** until a side runs out, at which point we
  reallocate at doubled capacity and recenter (an O(N) copy, but only O(log N)
  times total and off the render path — it happens on ingest, never per frame).
  A `baseIndex` offset means a **logical index stays bound to the same bar for
  its lifetime**: prepending decrements `baseIndex` instead of renumbering, so
  all index-keyed state survives backfill. (Reminder from the §9 reframe:
  panning itself allocates nothing — only batched, async backfill _ingest_
  does, a few times per second at most, so this is about avoiding O(N) copies,
  not per-frame churn.)

- **Decimation strategy:** when more than ~1 bar would map to the same pixel
  column, aggregate with a **min/max envelope** per pixel bucket (not LTTB —
  LTTB is tuned for line charts; OHLC needs the bucket's open of the first
  bar, close of the last, min(low)/max(high) across the bucket, so wicks
  aren't lost when zoomed out). This is the same category of approach
  TradingView uses for "lots of candles."
- **Multi-resolution cache:** precompute decimated levels lazily (e.g. a
  simple mipmap-style cache keyed by zoom bucket) so zooming out doesn't
  re-scan the full dataset every frame; invalidate/extend incrementally as
  new bars stream in rather than recomputing from scratch.
- **Data source interface:** keep it deliberately small and adapter-friendly:
  ```ts
  interface DataSource {
    getBars(range: { from: number; to: number }): Promise<Bar[]> | Bar[]
    subscribeLive?(onBar: (bar: Bar, isNewBar: boolean) => void): () => void
  }
  ```
  `chart.setData(bars)` / `series.setData(bars)` covers the static case
  directly (array in, no adapter required) — the interface above is only for
  consumers who want the chart to pull historical ranges / live ticks itself
  (infinite scroll back-fill, websocket feeds, etc). This directly targets
  "a simple and more intuitive interface for providing data from any source."

## 7. Time & price axes

- **Time axis:** given the visible index range and pixel width, pick a
  "nice" tick interval from a standard ladder (1s/5s/15s/30s, 1m/5m/15m/30m,
  1H/2H/4H, 1D, 1W, 1M, 1Y — extendable) based on target pixel-per-label
  density, same family of problem as D3's `ticks()` but interval-aware and
  index-based so it skips gaps for free. Label format adapts to the chosen
  interval (e.g. show date once per day boundary, time-only within a day).
- **Price axis:** autoscale to the visible range's min/max with margin,
  support multiple scales per pane (left/right) and multiple panes.
- **Volume sub-scale:** volume histogram renders in the bottom ~15–20% of
  the main pane, on its own price scale (0 → max visible volume × margin)
  that is **not shown** as a visible axis — exactly the "hidden Y axis"
  behavior from TradingView. Implemented as a pane-local scale object that
  the volume series renderer uses, independent of the main price scale.

## 8. Interaction

### 8.1 Pan / zoom

- Pointer Events exclusively (`pointerdown/move/up/cancel`) — covers mouse,
  touch, and pen in one code path, per the "touch and mouse" requirement.
- Drag = pan (adjust visible index range by pixel delta ÷ bar width).
- Wheel = zoom (desktop); pinch (two active pointers, track distance delta) =
  zoom (touch). Both **anchor on the pointer**: the bar under the cursor
  (wheel) or under the two-pointer centroid (pinch) stays fixed in pixel space
  as `barWidth` changes, so `fromIndex` is recomputed from the anchor rather
  than the left edge — this is what makes zoom feel "right" instead of
  sliding the data sideways.
- Visible range expressed as `{ fromIndex: number, barWidth: number }` with
  fractional pixel offset for smooth (sub-bar) panning, clamped so you can't
  pan past the data (with configurable right-side empty space, as TradingView
  allows).

### 8.2 Crosshair

- Pointer move (or press-and-hold on touch) updates the overlay layer only:
  dotted vertical + horizontal line through the nearest bar, with a label on
  the time axis and a label on the price axis showing that bar's time/price.
- Optional "magnet" mode to snap to OHLC values — flag for later, not v1-blocking.
- **Order-intent hook:** a small "+" button renders at the end of the
  horizontal dotted line, right at the price-axis gutter (same spot
  TradingView puts its quick-order button), on hover (desktop) or
  press-and-hold (touch). It's part of the overlay-text layer, so it costs
  nothing extra to draw. We own exactly the button and its click/tap — **not**
  any order form or popover. On activation we fire a callback with enough to
  build one:
  ```ts
  interface OrderIntentEvent {
    price: number // price-axis value at the crosshair row
    time: UTCTimestamp | null // null if the row is past the last bar
    index: number // bar index, for series lookups
    paneId: string // which pane (only the main price pane has this button by default)
    point: { x: number; y: number } // coords relative to the chart container
    clientPoint: { x: number; y: number } // viewport coords, for positioning a modal/popover
  }
  chart.onOrderIntent((e: OrderIntentEvent) => {
    /* host renders its own order form */
  })
  ```
  Opt-in, off by default (`createChart(el, { orderButton: true })` or similar)
  so charts that aren't trading UIs don't pay for it visually. We don't manage
  any resulting UI's lifecycle (open/close/position) — that's entirely the
  host's responsibility, we just hand it the data and get out of the way.
  A natural follow-on (not scoped yet, see §14) is a draggable order/position
  **price line** primitive the host could add once the form is submitted.

### 8.3 Live last candle & current price line

- `series.update(bar)`: if `bar.time` matches the last stored bar, mutate it
  in place and redraw only the last candle + affected axis labels; if it's a
  new bar, append and shift the viewport if pinned to the live edge ("follow
  mode", on by default, same as TradingView's right-edge behavior).
- Current price = last trade/close: dotted horizontal line across the main
  pane + a filled label on the price axis, rendered on the overlay layer so
  it updates cheaply on every tick without touching the series layer.

### 8.4 Indicators

- Two kinds, matching TradingView:
  - **Overlay indicators** — draw on the main pane, share its price scale
    (e.g. moving averages, Bollinger Bands).
  - **Pane indicators** — own sub-pane, own price scale, resizable via a
    drag handle between panes (e.g. RSI, MACD, a second volume-like panel).
- **Incremental calculation is a hard requirement, not an optimization**:
  an indicator computes its full output series once against the dataset and
  caches it; panning/zooming only _slices and redraws_ that cache for the
  visible range — it must never trigger recomputation. New live bars trigger
  an incremental tail update (most indicators — SMA, EMA, RSI, MACD — have
  O(1) or O(window) incremental update formulas; the indicator contract
  should expose that explicitly: `calculateAll(bars)` + `update(bar)`).
- **Extensibility model:** plain TypeScript/JS functions against a small
  runtime API (`ta.sma()`, `ta.ema()`, `ta.rsi()`, series accessors), not a
  bespoke scripting language, for v1. Ship a handful of built-ins (SMA, EMA,
  RSI, MACD, Bollinger Bands, Volume MA) as separate dynamically-importable
  modules.
- **On Pine Script specifically:** don't build a Pine Script-compatible
  engine. "Pine Script" is a proprietary, trademarked TradingView product;
  its reference docs/behavior are TradingView's IP and reverse-engineering
  it to achieve compatibility carries real legal risk, and the name itself
  can't be used regardless. A **TS/JS indicator API gets 90% of the value**
  (every indicator Pine can express, ours can express) without that risk. If
  there's later appetite for a friendlier DSL for non-programmers, design an
  original syntax/semantics inspired by Pine's ergonomics (implicit per-bar
  execution over a `series` type) — that's a Phase 6+ idea, not a blocker.

### 8.5 Annotations

- Drawing tools (trendline, horizontal/vertical line, rectangle, fib
  retracement, text) as their own interaction + overlay-rendering layer,
  independent of indicators.
- Hit-testing for select/drag/delete, serializable to plain JSON
  (`{ type, points, style }`) so host apps can persist/restore them —
  persistence itself is out of scope (host app's job).

## 9. Performance checklist

The headline fact (uPlot, Chart.js, ECharts, lightweight-charts all prove it):
**Canvas2D is fast enough for this when you don't fight it.** uPlot streams at
60fps and uses ~10% CPU / 12MB RAM where Chart.js and ECharts use 40–70% CPU
and 77–85MB on the same workload — same `<canvas>`, the difference is pipeline
discipline. The rules below are that discipline.

- Dirty-flag + single rAF scheduler (§5) so bursts of events coalesce to one paint/frame.
- Decimated min/max rendering above the 1-bar-per-pixel threshold (§6). This is
  the main lever: it caps the draw count at ~canvas-width no matter the dataset
  size, which is _why_ Canvas2D suffices (§3).
- **Columnar typed-array data store** (parallel `times[]/opens[]/…` arrays, not
  an array of bar objects) — uPlot's biggest win; near-zero per-point
  allocation and minimal GC. Resolves the §14 open question in favor of typed.
- **Batch draw calls by style, not by bar.** The cost is draw calls + style
  changes (each `fill()`/`stroke()`/`fillStyle=` crosses JS→native and
  re-validates state), not the number of subpaths in a path. So:
  - _Line/area series:_ the whole visible series goes into a single `Path2D`
    (or one `beginPath`→`stroke`) — one draw call.
  - _Candlesticks:_ walk the visible range once, bucket into up vs down, and
    accumulate all up bodies **and** wicks (wick = a 1-device-px-wide rect) as
    `rect()` subpaths in one path → set `fillStyle` once → one `fill()`; repeat
    for down. That's ~2 draw calls for the entire series regardless of candle
    count (more only if borders/wicks are separately styled). The anti-pattern
    is `fillStyle=…; fillRect(body); stroke(wick)` **per candle**.
  - Giant single-`fill()` paths usually beat N `fillRect()`s but not without
    limit — benchmark per the rule below.
- **One segment per x-pixel for line/area series.** When several points land in
  the same pixel column, emit only that column's min & max y (a tiny vertical
  span) instead of every point — same idea as OHLC decimation, applied to lines.
  This is how uPlot stays flat past 100k in-view points.
- **Draw only the in-view slice.** Binary-search the visible index range and
  iterate just that window every frame — never walk the full dataset to draw.
- **Snap to device pixels for crisp 1px lines** (round coords, +0.5 offset at
  dpr=1) — avoids blurry gridlines/axes and the reflow of sub-pixel strokes.
- No transitions/animations in the render core (uPlot's stance) — immediate
  mode only; any easing is a host concern.
- Avoid per-frame allocations in hot paths (reuse arrays/objects in the render loop).
- Evaluate `OffscreenCanvas` + a Worker for indicator math (and potentially the
  render loop) on very large datasets once there's a real perf baseline — not a
  v1 requirement, flag as a later investigation.
- Every perf claim gets a benchmark in `/demo` (e.g. a "500k candles" stress
  page) before being called done — no perf work lands without a before/after number.

## 10. Bundle size & modularity

- `lightfin-web-chart` core export = chart engine + candlestick/line/volume
  series + time/price axes + crosshair + pan/zoom only. That's the whole
  "lightweight" promise — everything else is opt-in.
- Subpath exports for everything else, each independently dynamically
  importable:
  - `lightfin-web-chart/indicators` (and maybe per-indicator subpaths if the
    built-in set grows large)
  - `lightfin-web-chart/annotations`
  - future: `lightfin-web-chart/react` wrapper
- `package.json` `exports` map + `sideEffects: false` so bundlers can
  tree-shake unused indicators/annotations even if a consumer imports from a
  barrel file.
- Track bundle size in CI (e.g. `size-limit`) once there's a core to measure, Phase 1+.

## 11. Public API sketch (subject to change during Phase 1)

```ts
const chart = createChart(container, {/* theme, rightOffset, ... */})
// synchronous — Canvas2D needs no async device init (see §5)

const candles = chart.addCandlestickSeries()
candles.setData(bars) // static
candles.update(bar) // live tick / new bar

const volume = chart.addHistogramSeries({ pane: 'overlay-hidden-scale' })
volume.setData(volumeBars)

const sma = await chart.addIndicator(
  import('lightfin-web-chart/indicators/sma'),
  { period: 20 },
)

chart.timeScale().fitContent()
chart.timeScale().setVisibleRange({ from, to })

chart.onOrderIntent(e => openMyOrderForm(e.price, e.clientPoint)) // see §8.2
```

Container sizing is implicit — the chart observes the container and always
fills it; there is no `width`/`height` option.

## 12. Testing

- **Vitest** for pure logic: decimation/min-max bucketing, tick/interval
  selection, scale math, indicator incremental-vs-batch equivalence.
- **Playwright** for interaction/visual tests against `/demo`: pan, zoom,
  crosshair, resize, touch gesture simulation, screenshot diffing for
  render regressions. Canvas2D renders on the CPU, so headless CI needs **no
  GPU flags or software-adapter setup** and screenshots are deterministic —
  this is a direct dividend of the Canvas2D choice (§3). Still keep a small
  pixel tolerance for cross-platform font/anti-aliasing differences.
- `/demo` doubles as manual QA playground and the thing Playwright drives —
  keep it running real, varied data (static JSON fixtures + a mock live feed).

## 13. Phased roadmap

0. **Cleanup & scaffolding** — strip template, lib-mode build, `/demo` app, Vitest wired up. _(this repo, right now)_
1. **Core rendering** — layered canvas engine, candlestick series, index-based time axis, price axis, pan/zoom, resize-to-container, static data only.
2. **Polish the single-pane experience** — crosshair, current-price line, volume sub-pane with hidden scale, smart interval/tick selection.
3. **Live data** — `update()` semantics, follow-mode, `DataSource` adapter interface, a demo websocket/mock feed.
4. **Indicators framework** — overlay + pane indicators, incremental calc contract, 4–6 built-ins.
5. **Annotations** — drawing tools, hit-testing, selection/drag.
6. **Scale-out perf work** — multi-resolution cache tuning, worker-based calc investigation, bundle-size budget in CI.
7. **Ecosystem** — framework wrappers (React first), theming system, docs site, (stretch) original scripting DSL.

## 14. Open questions

- Typed arrays vs. object arrays for the bar store — **leaning typed/columnar.**
  uPlot's headline efficiency (streaming 60fps, ~1/4 the CPU and ~1/7 the RAM
  of Chart.js/ECharts) comes largely from a **columnar layout** — parallel
  arrays (`times[]`, `opens[]`, `highs[]`, …) rather than an array of `{...}`
  bar objects — which all but eliminates per-point allocation and GC pressure
  (see §9). Still confirm with a Phase 1 spike, but that's the likely answer.
- Exact tick-interval ladder and label formats (locale handling for dates/numbers) — needs a decision before Phase 2 but doesn't block Phase 1.
- How far "fit any data source" goes — do we need built-in adapters (e.g. a REST/websocket helper), or is the interface in §6 enough and adapters are always user-land? Leaning toward interface-only for v1.
- Theming API shape (CSS variables vs. JS options object) — decide alongside Phase 1 since it touches the render layer.
- Order/position price-line primitive (draggable, host-managed order markers) flagged in §8.2 as a likely Phase 4/5 follow-on to the order-intent hook — not scoped yet.
- **Accessibility:** a canvas chart is invisible to screen readers and keyboard
  users. Decide the baseline story — at minimum an `aria-label` / described
  container and an optional hidden data-table representation; keyboard
  pan/zoom/crosshair is a nice-to-have. Doesn't block Phase 1, but decide before
  calling v1 "done" so it isn't bolted on.
- **If/when Canvas2D hits a wall** (per a real §9 benchmark — many panes/series
  repainting at high DPR is the likely trigger, not raw candle count), add a
  **WebGL** backend behind the renderer interface. Not WebGPU: equivalent perf
  class for 2D, far better browser reach and CI testability. No work until a
  benchmark justifies it.

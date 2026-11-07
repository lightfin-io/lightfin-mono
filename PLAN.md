# @lightfin/core — Project Plan

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

Phases 0–11 shipped: cleanup/scaffold, core rendering (candlesticks, index
time axis, price axis, pan/zoom, resize), crosshair + current-price line, volume
sub-pane, interval-aware time ticks, live data (update/follow-mode/DataSource +
history backfill), the indicator framework with SMA, EMA, Bollinger, RSI,
MACD, ATR, Stochastic, Volume MA, candlestick/bar/line/area series switchable in place via
`setChartType()`, the `/chrome` widgets (instrument metadata + timezone,
HUD/legend, indicator rows, top/bottom/left toolbars, go-to modal, exchange
clock), the `/annotations` drawing tools (21 types — lines, channels,
pitchfork, regression, fibs, shapes, brush, labels, position and range
measures — with undo/redo and a per-drawing style toolbar) on a generic
primitive hook, the order-intent "+" hook, magnet crosshair
mode, the 500k-candle stress page, a bundle-size budget in CI, a touch
crosshair, resizable indicator panes, `/price-lines` for orders and
positions, keyboard control with screen-reader output, and Playwright tests
in CI. Decimation was measured and deliberately not built (§6).
See §13; ecosystem work (theming) is parked in §14.

## 3. Core technical decisions

| Decision           | Choice                                                                                                                                                                                                                                                                                                                                                |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rendering          | **Canvas2D for everything** (geometry + text), stacked as layered `<canvas>`. The 0.5px minimum bar width (§6) caps draw count at ~2 bars per pixel, so GPU isn't needed; Canvas2D is synchronous, universal, deterministic in headless CI. |
| X-axis model       | **Index-based** (uniform bar spacing); time is a per-index label, not a continuous axis. Skips weekend/overnight gaps for free, integer-friendly panning.                                                                                                                                                                                             |
| Language           | TypeScript, **zero runtime dependencies**.                                                                                                                                                                                                                                                                                                            |
| Framework bindings | None in core; thin framework wrappers ship as sibling packages in the monorepo (§4). `@lightfin/react` ships (§8.8); a Vue wrapper can follow the same shape.                                                                                                                                                                                 |
| Scripting          | Indicators are plain TS/JS against a small API; **no** Pine Script clone or custom DSL (§8.4).                                                                                                                                                                                                                                                        |

## 4. Module layout

A Bun-workspace monorepo. The root is just the toolchain + orchestration
(`bun run build/test/typecheck/size` fan out to the packages); each package
builds and versions on its own.

```
packages/
  core/         The chart library, published as `@lightfin/core`.
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
    demo/         Playground + Playwright target (§12)
    e2e/          Playwright tests
  react/        React bindings, published as `@lightfin/react` (§8.8).
    src/          <LightfinChart> + hooks; both react and the core are peers.
```

Within core, `indicators/`, `annotations/`, `priceLines/`, `chrome/` are
subpath exports (§10). The React wrapper is a separate package (so the core
pulls in no React and stays framework-agnostic), consuming only the core's
public entry.

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
- **DataSource interface** (opt-in; `setData` covers the static case directly).
  `chart.setDataSource(source)` hands loading to the chart:
  ```ts
  interface DataSource {
    // The newest `count` bars before `before` (absent: the newest bars).
    getBars(req: {
      before?: UTCTimestamp
      count: number
      signal: AbortSignal
    }): Promise<Bar[]> | Bar[]
    subscribeLive?(onBar: (bar: Bar) => void): () => void
  }
  ```
  - **Count-based, not time ranges:** on an index axis the chart knows how
    many bars it needs, not how much time they span (weekends, halts). A
    time window over a gap would come back empty and read as "no more
    history"; "N bars before T" never does, so `[]` can mean exactly that.
  - **The chart drives it:** clears the series, asks for one screen of the
    newest bars (at ~8px/bar), then keeps a screen of history loaded left of
    the view as it pans/zooms. A short page (an API cap, e.g. Binance's 1000) is followed by another; `[]` marks the start of history and stops
    requests. Go-to-date pages back to the target the same way.
  - **One request at a time, cancelled only when superseded:** calls while a
    request runs share it. Every older page extends the same left edge, so
    panning never cancels one; replacing the source (interval/symbol switch),
    `setData()`, or `remove()` aborts it via `signal` and drops a late result.
    Failures back off (1s doubling to 30s); a failed first page retries.
  - **Merging:** pages are sorted, de-duplicated, and trimmed to before the
    oldest bar; live bars that arrive before the first page are held and
    merged after it (so subscribing first leaves no gap); live bars older
    than the last bar are dropped. History only grows left and live bars
    right, so the data stays contiguous and indices stable. Healing a
    websocket disconnect is the adapter's job (it knows when it dropped):
    the demo's replays the missed bars over REST before resuming.
  - No built-in adapters: wiring an exchange API is a few lines of host code
    (the demo's Binance adapter is ~100), and shipping adapters would mean
    tracking every vendor's API.

## 7. Time & price axes

- **Time axis:** pick a "nice" tick interval from a ladder
  (1s/5s/15s/30s, 1m/5m/15m/30m, 1H/2H/4H, 1D/1W/1M/1Y) by target pixel-per-label
  density; index-based so it skips gaps. Label format adapts to interval. Ticks
  render in the instrument timezone (§6).
- **Price axis:** autoscale to visible min/max with margin. The main pane and
  each indicator sub-pane have their own right-side scale.
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
- **Calc stays on the main thread.** On the stress page the six built-ins
  compute over 500k bars in ~110ms total, once on load; live ticks are O(1).
  The only recurring cost is backfill, which recomputes over the full history:
  ~140ms after prepending 50k to 500k, a few ms at typical sizes (≤50k bars).
  If backfill hitches show up, cheaper levers come first: rolling-sum
  SMA/Bollinger/Volume MA (they re-scan their window per bar) and time-sliced
  recompute.
- **Extensibility:** plain TS/JS functions against a small runtime API
  (`ta.sma()`, `ta.ema()`, `ta.rsi()`, series accessors), each a dynamically
  importable module. Built-ins: SMA, EMA, RSI, MACD, Bollinger, ATR (Wilder
  true-range volatility, pane), Stochastic (%K/%D on a 0–100 pane), Volume MA
  (an overlay on the hidden volume scale, `scale: 'volume'`).
- **Default plot colors come from the theme palette, not hardcoded hex.**
  `ChartTheme.indicatorPalette` is an array of colors; a definition lists
  which of its option keys are colors via `colorKeys` (e.g. `['color']`, or
  MACD's `['macdColor', 'signalColor']` — its histogram stays tied to
  `upColor`/`downColor`, not the palette, since it's directional rather than
  arbitrary). `chart.addIndicator()` assigns each new indicator the next
  palette slot, cycling once exhausted; an explicit `color` in the caller's
  options always wins over the palette. Reconfiguring via `setOptions()`
  keeps the already-resolved color since it's merged back in before the next
  resolution runs.
- **AI-friendly:** an AI-driven UI can dynamically add existing or author new
  indicators.
- **JS/TS is the indicator language — no custom DSL.** No Pine Script clone
  (proprietary/trademarked, legal risk) and no Pine-inspired language of our
  own either: plain TS/JS needs no parser or runtime, gets real tooling and
  types for free, and is what AI authors write best.

### 8.5 Annotations

- Drawing tools in the `/annotations` subpath, independent of indicators. They plug into the core
  through a generic **primitive** hook (`chart.attachPrimitive()`): draw
  callbacks on the series and overlay layers plus pointer hooks that can claim
  a press (so it doesn't pan). The core carries no annotation code.
- **Anchored by time + price**, not index: `chart.timeToCoordinate()`
  interpolates between bars and extrapolates past either end, so drawings hold
  across backfill, interval switches, and into the right-offset space.
- Committed drawings paint on the series layer; the selected one and any in
  progress paint on the overlay, so dragging never repaints the rest.
- **Types** (point count in brackets), one `ToolSpec` each (points, draw,
  hit, handles, caption) in a table split by family:
  - Lines: `trendline` [2], `hline`, `hray`, `vline`, `crossline` [1].
  - Channels: `channel` [3: base line + a point on the parallel], `pitchfork`
    [3], `regression` [2: a least-squares fit of the closes between two times,
    with a ±max-deviation band, recomputed from the bars and cached].
  - Fibonacci: `fib` retracement [2], `fibExtension` [3: levels projected from
    the third point].
  - Shapes: `rectangle`, `ellipse` [2], `triangle` [3], `brush` [≥2, freehand].
  - Labels: `text` [1], `callout` [2: anchor + box], `priceLabel` [1],
    `marker` [1: `arrowUp` / `arrowDown` / `circle` / `flag`].
  - Measure: `longPosition` / `shortPosition` [3: entry, target, stop; zones,
    prices, percentages, and risk/reward], `measure` [2: Δprice, %, bars,
    duration].
- **Variants are presets, not types:** the toolbar's Ray, Extended line, and
  Arrow are trendlines with `style.extend` / `style.arrow` (none, start, end,
  or both), the highlighter a wide translucent brush, marker
  flavors a `shape` — `setTool(type, { style, shape })` seeds the next
  drawing, so the JSON stays small and every variant stays editable.
- **Style:** `color`, `lineWidth`, `lineStyle`, `fillColor`, `fontSize`,
  `fontFamily`, `bold`, `italic`, `textColor`, `extend`, `arrow`; unset keys
  fall back to per-type defaults (filled shapes at 15% of the line color,
  white text in boxed labels). `update(id, { style: { key: undefined } })`
  reverts a key to its default.
- Pick a tool, then drag or click per point (one click for single-point and
  position tools, which lay out a default zone); the brush records the drag.
  Points snap to bar times and follow magnet mode. Select to drag the body
  (whole bars, free in price) or a handle; Delete removes, Escape cancels;
  double-click edits text in place (multi-line: Shift+Enter). The tool
  reverts to the cursor after each drawing unless `setStickyTool(true)`.
- **Editing:** undo/redo (Ctrl/⌘+Z, Shift+Ctrl/⌘+Z or Ctrl+Y; `undo()` /
  `redo()`, 100 steps, `load()` resets), `clone(id)`, `bringToFront` /
  `sendToBack`, per-drawing `locked` (selectable, not movable) plus
  `setLocked()` for all, and `setVisible()` to hide all.
- **Captions:** `text` on any non-text drawing labels it — above an hline's
  right end, at the bottom of a vline, inside a rectangle's top-left, along a
  trendline's midpoint, beside a marker. Clicking a caption selects its drawing.
- Serializable to plain JSON (`{ id, type, points: [{ time, price }], style,
text?, shape?, group?, locked? }`) via `toJSON()` / `load()`; a `change` event (once per edit, not
  mid-drag) tells the host when to persist — persistence itself is the host's job.

### 8.6 Accessibility

- The canvases are invisible to assistive tech, so the chart element is a
  focusable `role="group"` with `aria-roledescription="chart"`, labelled
  "<instrument>, <chart type> chart". On focus its description summarizes
  the view: time range, bar count, high/low, last close, and the keys.
- **Keyboard** (while the chart has focus): ←/→ walk the crosshair bar by bar
  (Shift: 10), Home/End jump to the oldest/newest loaded bar, +/− zoom,
  Escape drops the crosshair. The view scrolls to keep the bar on screen, the
  crosshair sits on its close (so the HUD shows it), and a polite live region
  announces its OHLCV. The pointer takes the crosshair back on move.
- Keyboard focus draws a ring on the overlay canvas in the theme's line color
  (a CSS outline would sit under the canvases); a mouse click focuses the
  chart without it.
- No hidden data table: walking bars with announcements reads the same data,
  and a table of every loaded bar (up to 500k) would be a heavy DOM.

### 8.7 Programmatic & AI annotations

The indicator API lets an AI _write_ an indicator (§8.4); this lets one
_annotate_ a chart — mark support/resistance, flag signals, box a range —
through the same JSON the drawing tools persist. No new runtime or language:
the model emits annotation JSON, the host applies it.

- **Reading the chart:** `chart.visibleTimeRange()` and
  `series.bars({ from, to })` give the host the bars on screen to hand the
  model; `indicator.value(key, index)` and `drawings.list()` (the user's
  own drawings) add context.
- **Groups:** `group` tags who placed a drawing. `drawings.replace('ai',
annotations)` swaps that group's drawings for a new set in one `change`,
  leaving the user's alone, so each analysis replaces the last;
  `list(group)` / `clear(group)` scope to it. AI drawings are ordinary
  drawings otherwise — the user can select, move, or delete them.
- **Ids:** callers may supply their own (unique) ids, so a model can refer
  back to its drawings (`update('support-1', …)`) across turns.
- **Validation as feedback:** model output is untrusted, so `add` / `load` /
  `replace` / `update` validate everything and throw a message listing each
  problem by field and position (`[2] points[0].time looks like
milliseconds; use Unix seconds`). A batch is all-or-nothing. Hosts can
  pass the message back to the model to retry; `validateAnnotation()` runs
  the same checks without throwing.
- **Schema:** `/annotations/schema` exports `annotationSchema` (JSON Schema
  for one annotation, with model-facing descriptions of each type and
  field) and `annotateChartTool` (`{ name, description, inputSchema }`, MCP's
  shape; trivially mapped to Anthropic's `input_schema` or OpenAI's
  `parameters`) whose input is `{ annotations }`, meant for
  `replace('ai', input.annotations)`. Plain data in its own chunk, so charts
  without AI never load it; a unit test keeps its enums in step with the
  validator.
- The library makes no model calls: which model, prompt, and transport is
  the host's business, as with data sources (§6). The demo's "AI annotate"
  button runs an offline stand-in analyst (swings, regression trend, fib)
  through the same tool-call path, and the e2e tests drive it.

### 8.8 React wrapper

A thin React binding in its own package, `@lightfin/react` (§4), with
both `react` and `@lightfin/core` as peer dependencies — so the core pulls
in no React and the dependency-free promise holds for everyone else. It only
glues the imperative chart to React's lifecycle — no feature is re-expressed as
a component tree, so there's nothing to keep in step as the core grows.

- **`<LightfinChart>`** owns one chart: creates it in a layout effect on mount,
  `remove()`s it on unmount. `options` apply once at construction (the engine
  has no live option setter — §5); a new `key` recreates it. Event-handler
  props (`onCrosshairMove`, `onDataChange`, `onOrderIntent`, …) are
  **ref-latched** — subscribed once per instance, always calling the latest
  prop, so passing inline handlers never churns subscriptions. `instrument`
  syncs on change (`undefined` leaves it alone); the instance is exposed through
  a forwarded `ref` and `onCreate`.
- **`useChartEffect(fn, deps)`** is the escape hatch: it runs `fn(chart)` once
  the instance exists and cleans up on unmount, so wiring series, indicators,
  `createChrome`, `createAnnotations`, or `addPriceLine` is a few lines in a
  child component rather than a wrapper per feature. `useChart()` reads the
  instance from context for the imperative cases.
- Unit-tested under jsdom with the chart mocked (lifecycle, event latching,
  context), matching how the annotations tests mock the chart (§12); the real
  engine is exercised by the Playwright suite.

### 8.9 Event tags

Small tags along the bottom of the price pane for scheduled events — earnings
(E), dividends (D), or any host-flagged time — in the `/event-tags` subpath,
on the same primitive hook as price lines. Like the order-intent hook (§8.2),
the library owns only the marker: it draws the tags (anchored by time, row-
stacked when they'd overlap, highlighted on hover) and reports a click through
`onSelect(event, { point, clientPoint })`; the host renders whatever detail
card it likes, TradingView-style, above the tag. No built-in modal (kept
consistent with §8.2); the demo renders a small card and the e2e suite drives
it.

```ts
import { addEventTags } from '@lightfin/core/event-tags'
const tags = addEventTags(chart, {
  events: [{ time, type: 'earnings', title, body }],
  onSelect: (e, pos) => openMyCard(e, pos.clientPoint),
})
tags.setEvents(next)
```

## 9. Chart chrome / UI widgets

Optional DOM widgets rendered inside the chart container, driven by chart state +
events. Subpath-exported and tree-shakeable (`@lightfin/core/chrome`) so
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
- **Left annotation toolbar:** cursor, then one button per tool family (lines,
  channels, fibonacci, shapes, labels, measure) that arms the family's last
  used tool, with a corner chevron (or right-click) opening a flyout of the
  rest; then toggles for magnet, stay-in-drawing-mode, lock all, hide all, and
  remove all. Wired to §8.5; shown only when the host passes an annotations
  instance (`createChrome(chart, { annotations })`), so chrome never imports
  annotation code itself.
- **Drawing style toolbar:** a floating bar for the selected drawing, top-right
  of the main pane and draggable by its grip, with only the controls its type
  uses: color (palette, custom, opacity), width, line style, fill, text color,
  font family + size, bold/italic, edit text/caption, line ends, lock, a more
  menu (clone, bring to front, send to back), and delete. Looks picked here
  are remembered per tool for its next drawing.
- Popovers (indicators menu, flyouts, style menus) share one helper:
  `aria-haspopup`/`aria-expanded`, close on outside press or Escape, clamped to
  the chart. Icons and layout are our own designs.

## 10. Bundle size & modularity

- **Core export** = chart engine + candlestick/line/area/bar/volume series +
  time/price axes + crosshair + pan/zoom. Everything else is opt-in.
- **Subpath exports**, each dynamically importable: `/indicators` (and
  per-indicator), `/annotations` (and `/annotations/schema`), `/price-lines`,
  `/event-tags`, `/chrome`. The React binding is a separate package, not a
  subpath (§8.8), so the core gains no React dependency.
- `package.json` `exports` map + `sideEffects: false` for tree-shaking.
- Bundle size is budgeted in CI with `size-limit` (per-package `.size-limit.json`,
  `bun run size` fans out): the core package budgets core, chrome, annotations,
  the annotations schema, price lines, event tags, one indicator, all
  indicators, and everything together; the React package budgets its glue alone (both react and
  the core are external). Each has ~10% headroom. Raising a budget is a deliberate, reviewed change.

## 11. Public API sketch

```ts
const chart = createChart(container, {/* theme, rightOffset, ... */}) // synchronous

chart.setInstrument({ symbol: 'BTCUSD', exchange: 'BINANCE', timezone: 'UTC' })

const candles = chart.addCandlestickSeries() // or addLineSeries / addAreaSeries / addBarSeries
chart.setDataSource(binanceSource) // chart pages history + merges live (§6)
candles.setData(bars) // or static
candles.update(bar) // live tick / new bar
candles.setChartType('line') // switch render type on the same series

const volume = chart.addHistogramSeries({ pane: 'overlay-hidden-scale' })
volume.setData(volumeBars)

const sma = await chart.addIndicator(
  import('@lightfin/core/indicators/sma'),
  { period: 20 },
)
sma.setOptions({ period: 50 })
sma.setVisible(false)
sma.remove()
chart.indicators() // handles: name, params, plots, value(key, index)

chart.fitContent()
await chart.setVisibleTimeRange({ from, to }) // backfills older history first
candles.bars(chart.visibleTimeRange()!) // the bars on screen, e.g. for an AI to read
await chart.scrollToTime(time)
chart.on('crosshairMove', e => {
  /* e?.index, e?.time */
}) // + dataChange, indicatorsChange, layoutChange, …
chart.onOrderIntent(e => openMyOrderForm(e.price, e.clientPoint)) // §8.2

// Working orders/positions (§8.2), from '@lightfin/core/price-lines'.
const order = addPriceLine(chart, {
  price,
  title: 'Limit 1.0',
  draggable: true,
})
order.on('dragEnd', price => modifyOrder(id, price))

// Event tags (§8.9), from '@lightfin/core/event-tags'. Library draws the
// tag; host renders the detail card on select.
const tags = addEventTags(chart, {
  events: [{ time, type: 'earnings', title: 'Q3 earnings', body }],
  onSelect: (e, pos) => openMyCard(e, pos.clientPoint),
})

// Drawing tools (§8.5), from '@lightfin/core/annotations'.
const drawings = createAnnotations(chart)
drawings.load(saved)
drawings.on('change', () => save(drawings.toJSON()))
drawings.setTool('trendline') // or let the left toolbar do it

// An AI's drawings (§8.7): hand it the bars and annotateChartTool (from
// '@lightfin/core/annotations/schema'); apply each tool call as a group.
drawings.replace('ai', toolCall.input.annotations) // throws a retry-able message

// Optional widgets (§9); the host owns intervals and reloads bars on change.
const chrome = createChrome(chart, {
  intervals: ['1m', '1H', '1D'],
  interval: '1m',
  onIntervalChange,
  annotations: drawings, // adds the drawing and style toolbars
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
- **Playwright** (`e2e/`, `bun run test:e2e`, in CI) against
  `/demo?feed=mock&live=0`:
  real pointer and keyboard input, asserting through the public API
  (`paneLayout()`, `timeScale()`, events) rather than pixels. Screenshot
  diffing is left out: baselines differ between macOS dev machines and Linux
  CI in font rendering, so they'd need generating in a Linux container.
- `/demo` is both manual QA playground and the Playwright target. It loads
  live BTC/USDT from Binance's public market data (REST klines + kline
  websocket); `?feed=mock` swaps in a deterministic offline feed, and
  `?live=0` drops the live ticks so the chart holds still.
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
8. **Scale-out perf** — 500k-candle stress page, bundle-size budget in CI, order-intent hook + magnet mode. ✅ Decimation was measured and not built (§6).
9. **v1 gaps** — touch press-and-hold crosshair, resizable indicator panes, price lines, accessibility + keyboard control, Playwright e2e in CI. ✅
10. **Chart-driven loading** — count-based `DataSource` paging with cancellation and live merging (§6), demo on live Binance BTC/USDT. ✅
11. **Drawing-tool depth** — 21 drawing types, presets, undo/redo, clone/z-order/lock/hide, grouped left toolbar with flyouts, floating style toolbar with color/font/line controls (§8.5, §9). ✅ Not built: a full per-drawing settings dialog (exact coordinates, per-level fib toggles), Gann/Elliott/pattern tools, per-drawing visibility, and toolbar undo buttons.
12. **Event tags** — `/event-tags` subpath: earnings/dividend tags along the bottom of the price pane, host-rendered detail card on click (§8.9). ✅

## 14. Misc

- **Event tags** ✅ — `/event-tags` subpath (§8.9): E/D (earnings/dividend)
  tags along the bottom of the price pane; a click fires `onSelect` and the
  host renders the detail card above the tag (TradingView-style). The card
  stays host-rendered by design, like the order hook (§8.2).
- Settings modal, saving annotations, reset to defaults etc
- **Ecosystem** — React wrapper ✅ (shipped as `@lightfin/react`, §8.8,
  which also moved the repo to a Bun-workspace monorepo, §4). Docs/marketing
  site ✅ (`packages/www`, Astro + Starlight). Theming: the JS `ChartTheme`
  object is the source of truth;
  chrome's `themeVars()` derives CSS variables from it one-way for the DOM
  widgets. Settled — no reverse (CSS-as-source) path.
- Add more indicators

## 15. Open questions

- **Date locale** — axis/crosshair month names are English and the clock is
  24h `en-GB`; numbers go through `priceFormatter`. A `locale` option would
  route dates through `Intl.DateTimeFormat` too.

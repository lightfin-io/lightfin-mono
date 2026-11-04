# @lightfin/core

A lightweight, dependency-free financial charting library for the web —
candlesticks, volume, indicators, drawing tools, smooth pan/zoom, and live data,
rendered on HTML5 Canvas2D. Framework-agnostic (vanilla TS core), tree-shakeable,
and easy to wire up to any data source.

See [PLAN.md](./PLAN.md) for the full design and roadmap.

## Status

Early development. Phases 0–11 shipped (see [PLAN.md §13](./PLAN.md)).

## Monorepo

A [Bun](https://bun.sh) workspace. Packages live under [`packages/`](./packages):

- **[`packages/core`](./packages/core)** — the chart library, published as
  `@lightfin/core`. Framework-agnostic, zero runtime dependencies. Holds the
  `demo/` playground and Playwright `e2e/` suite.
- **[`packages/react`](./packages/react)** — React bindings, published as
  `@lightfin/react` (`<LightfinChart>` + hooks). `react` and the core
  are peer dependencies, so the core stays React-free.

## Development

```sh
bun install
bun run dev        # serve the /demo playground (app-mode Vite)
bun run build      # build every package (ESM + .d.ts) to packages/*/dist
bun run test       # run unit tests (Vitest) across packages
bun run test:e2e   # run browser tests against the demo (Playwright)
bun run typecheck  # tsc --noEmit across packages
bun run size       # check built bundles against each package's .size-limit.json
bun run format     # prettier --write
```

The root scripts fan out to the workspace packages; run a single package's
scripts with `bun run --filter <name> <script>` (e.g.
`bun run --filter @lightfin/react test`). With `bun run dev` running,
`/stress.html` loads 500k candles and benchmarks paint, calc, and backfill times.

## License

MIT

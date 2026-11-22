# Lightfin

Monorepo for [Lightfin](./packages/core), a lightweight, dependency-free
financial charting library for the web — candlesticks, volume, indicators,
drawing tools, smooth pan/zoom, and live data, rendered on HTML5 Canvas2D.
The core is framework-agnostic vanilla TypeScript; framework bindings and the
docs site live beside it.

<img width="1057" height="530" alt="Chart Screenshot" src="https://github.com/user-attachments/assets/76cb6b7a-6b97-42a5-bfc7-eb8891c3a8a4" />

Open work is in [ROADMAP.md](./ROADMAP.md). Library usage is in
[`packages/core/README.md`](./packages/core/README.md).

## Status

Pre-1.0. Shipped: core rendering, live data, 16 indicators, chart chrome,
21 drawing tools, scale-out performance (500k-candle stress page, bundle-size
budget), accessibility and keyboard control, chart-driven history loading,
drawing-tool depth, and event tags. `@lightfin/react` and the docs site
(`packages/www`) are in the repo.

Still open: a settings modal, saving annotations and reset-to-defaults, more
indicators, and date locale. Details are in [ROADMAP.md](./ROADMAP.md).

## Packages

A [Bun](https://bun.sh) workspace. Packages live under [`packages/`](./packages):

| Package | Name | What it is |
| --- | --- | --- |
| [`packages/core`](./packages/core) | `@lightfin/core` | The chart library. Zero runtime dependencies. Holds the `demo/` playground and the Playwright `e2e/` suite. |
| [`packages/react`](./packages/react) | `@lightfin/react` | React bindings (`<LightfinChart>` + hooks). `react` and the core are peer dependencies, so the core stays React-free. |
| [`packages/www`](./packages/www) | `@lightfin/www` | Marketing site and documentation (Astro + Starlight). Private; not published. |

## Development

```sh
bun install
bun run dev        # serve the core /demo playground (app-mode Vite)
bun run www        # serve the docs site
bun run build      # build core and react (ESM + .d.ts) to packages/*/dist
bun run build:www  # build core, react, and the docs site
bun run test       # unit tests (Vitest) across packages
bun run test:e2e   # browser tests against the demo (Playwright)
bun run typecheck  # tsc --noEmit across packages
bun run size       # check built bundles against each package's .size-limit.json
bun run format     # prettier --write
```

Root scripts fan out to the workspace. Run one package with
`bun run --filter <name> <script>` (for example
`bun run --filter @lightfin/react test`). With `bun run dev` running,
`/stress.html` loads 500k candles and benchmarks paint, calc, and backfill
times.

## License

MIT

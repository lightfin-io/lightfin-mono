# Lightfin

[![npm @lightfin/core](https://img.shields.io/npm/v/%40lightfin%2Fcore?label=%40lightfin%2Fcore)](https://www.npmjs.com/package/@lightfin/core)
[![npm @lightfin/react](https://img.shields.io/npm/v/%40lightfin%2Freact?label=%40lightfin%2Freact)](https://www.npmjs.com/package/@lightfin/react)

Monorepo for [Lightfin](./packages/core), a lightweight, dependency-free
financial charting library for the web — candlesticks, volume, indicators,
drawing tools, smooth pan/zoom, and live data, rendered on HTML5 Canvas2D.
The core is framework-agnostic vanilla TypeScript; framework bindings and the
docs site live beside it.

<img width="1057" height="530" alt="Chart Screenshot" src="https://github.com/user-attachments/assets/76cb6b7a-6b97-42a5-bfc7-eb8891c3a8a4" />

Library usage is in [`packages/core/README.md`](./packages/core/README.md).

## Packages

A [Bun](https://bun.sh) workspace. Packages live under [`packages/`](./packages):

| Package                              | Name              | What it is                                                                                                            |
| ------------------------------------ | ----------------- | --------------------------------------------------------------------------------------------------------------------- |
| [`packages/core`](./packages/core)   | `@lightfin/core`  | The chart library. Zero runtime dependencies. Holds the `demo/` playground and the Playwright `e2e/` suite.           |
| [`packages/react`](./packages/react) | `@lightfin/react` | React bindings (`<LightfinChart>` + hooks). `react` and the core are peer dependencies, so the core stays React-free. |
| [`packages/www`](./packages/www)     | `@lightfin/www`   | Marketing site and documentation (Astro + Starlight). Private; not published.                                         |

## FAQ

### Why did you use Canvas2D and not WebGL or WebGPU?

Measured in real browsers, Canvas2D was faster — WebGL/WebGPU were about 30% slower. A frame is a few thousand flat rects batched into two fills, and pan/zoom rewrites every position, so the GPU never has enough raster work to pay back WebGPU's per-frame buffer upload and command submit. Canvas2D records the same rects and the browser tessellates and rasterizes them.

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

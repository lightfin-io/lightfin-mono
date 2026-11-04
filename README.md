# lightfin-web-chart

A lightweight, dependency-free financial charting library for the web —
candlesticks, volume, indicators, drawing tools, smooth pan/zoom, and live data,
rendered on HTML5 Canvas2D. Framework-agnostic (vanilla TS core), tree-shakeable,
and easy to wire up to any data source.

See [PLAN.md](./PLAN.md) for the full design and roadmap.

## Status

Early development. Phases 0–6 shipped (see [PLAN.md §13](./PLAN.md)).

## Development

Toolchain is [Bun](https://bun.sh).

```sh
bun install
bun run dev        # serve the /demo playground (app-mode Vite)
bun run build      # build the library (ESM + .d.ts) to dist/
bun run test       # run unit tests (Vitest)
bun run typecheck  # tsc --noEmit
bun run format     # prettier --write
```

The library lives in [`src/`](./src); [`demo/`](./demo) is a thin playground app
that imports the library from source via a path alias.

## License

MIT

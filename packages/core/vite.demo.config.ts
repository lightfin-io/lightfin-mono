import { resolve } from 'node:path'
import { defineConfig } from 'vite'

const root = import.meta.dirname

/**
 * App-mode config for the /demo playground (`bun run dev`). The demo imports
 * the library by its package name; the alias points that at live `src` so the
 * demo is a true playground / Playwright target against the real source.
 */
export default defineConfig({
  root: resolve(root, 'demo'),
  resolve: {
    // Ordered, most-specific first. The regex maps per-indicator subpaths
    // (`lightfin-web-chart/indicators/sma`) straight to their source file so the
    // demo exercises real dynamic imports against `src`.
    alias: [
      {
        find: /^lightfin-web-chart\/indicators\/(.+)$/,
        replacement: resolve(root, 'src/indicators/$1.ts'),
      },
      {
        find: 'lightfin-web-chart/indicators',
        replacement: resolve(root, 'src/indicators/index.ts'),
      },
      {
        find: 'lightfin-web-chart/chrome',
        replacement: resolve(root, 'src/chrome/index.ts'),
      },
      {
        find: 'lightfin-web-chart/annotations/schema',
        replacement: resolve(root, 'src/annotations/schema.ts'),
      },
      {
        find: 'lightfin-web-chart/annotations',
        replacement: resolve(root, 'src/annotations/index.ts'),
      },
      {
        find: 'lightfin-web-chart/price-lines',
        replacement: resolve(root, 'src/priceLines/index.ts'),
      },
      {
        find: 'lightfin-web-chart',
        replacement: resolve(root, 'src/index.ts'),
      },
    ],
  },
  server: {
    port: 5173,
    open: true,
  },
  build: {
    outDir: resolve(root, 'dist-demo'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(root, 'demo/index.html'),
        stress: resolve(root, 'demo/stress.html'),
      },
    },
  },
})

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
    // (`@lightfin/core/indicators/sma`) straight to their source file so the
    // demo exercises real dynamic imports against `src`.
    alias: [
      {
        find: /^@lightfin\/core\/indicators\/(.+)$/,
        replacement: resolve(root, 'src/indicators/$1.ts'),
      },
      {
        find: '@lightfin/core/indicators',
        replacement: resolve(root, 'src/indicators/index.ts'),
      },
      {
        find: '@lightfin/core/chrome',
        replacement: resolve(root, 'src/chrome/index.ts'),
      },
      {
        find: '@lightfin/core/annotations/schema',
        replacement: resolve(root, 'src/annotations/schema.ts'),
      },
      {
        find: '@lightfin/core/annotations',
        replacement: resolve(root, 'src/annotations/index.ts'),
      },
      {
        find: '@lightfin/core/price-lines',
        replacement: resolve(root, 'src/priceLines/index.ts'),
      },
      {
        find: '@lightfin/core/event-tags',
        replacement: resolve(root, 'src/eventTags/index.ts'),
      },
      {
        find: '@lightfin/core',
        replacement: resolve(root, 'src/index.ts'),
      },
    ],
  },
  server: {
    port: 5180,
    open: true,
  },
  build: {
    // Match the library build. The default target predates light-dark().
    target: ['chrome123', 'edge123', 'firefox120', 'safari17.5', 'ios17.5'],
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

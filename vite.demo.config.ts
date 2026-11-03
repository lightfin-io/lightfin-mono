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
    alias: {
      'lightfin-web-chart/indicators': resolve(root, 'src/indicators/index.ts'),
      'lightfin-web-chart/annotations': resolve(
        root,
        'src/annotations/index.ts',
      ),
      'lightfin-web-chart': resolve(root, 'src/index.ts'),
    },
  },
  server: {
    port: 5173,
    open: true,
  },
  build: {
    outDir: resolve(root, 'dist-demo'),
    emptyOutDir: true,
  },
})

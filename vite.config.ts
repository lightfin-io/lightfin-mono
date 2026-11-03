import { resolve } from 'node:path'
import { defineConfig } from 'vite'

const root = import.meta.dirname

/**
 * Library-mode build (`bun run build`). Emits tree-shakeable ESM for the core
 * entry plus the opt-in subpath exports (PLAN §10). Type declarations are
 * emitted separately by `tsc --emitDeclarationOnly` (see build script) — the
 * native TS 7 compiler handles .d.ts for us, so no vite-plugin-dts needed.
 */
export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
    // Zero runtime dependencies, so nothing to externalize.
    lib: {
      entry: {
        index: resolve(root, 'src/index.ts'),
        indicators: resolve(root, 'src/indicators/index.ts'),
        annotations: resolve(root, 'src/annotations/index.ts'),
      },
      formats: ['es'],
    },
    rollupOptions: {
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name]-[hash].js',
      },
    },
  },
})

import { resolve } from 'node:path'
import { defineConfig } from 'vite'

const root = import.meta.dirname

/**
 * Library-mode build for the React wrapper. React and the chart core are peer
 * dependencies, so both are externalized — the bundle is just the glue. Type
 * declarations are emitted separately by `tsc` (see the build script).
 */
export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
    lib: {
      entry: {
        index: resolve(root, 'src/index.ts'),
        'event-tags': resolve(root, 'src/event-tags.ts'),
      },
      formats: ['es'],
    },
    rollupOptions: {
      external: [
        'react',
        'react-dom',
        'react/jsx-runtime',
        '@lightfin/core',
        '@lightfin/core/event-tags',
      ],
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name]-[hash].js',
      },
    },
  },
})

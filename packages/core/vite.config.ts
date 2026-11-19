import { resolve } from 'node:path'
import { defineConfig } from 'vite'

const root = import.meta.dirname

/**
 * Library-mode build (`bun run build`). Emits tree-shakeable ESM for the core
 * entry plus the opt-in subpath exports. Type declarations are
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
        // Each built-in indicator is its own entry → its own chunk, so it loads
        // on demand and never weighs down the core. Add a line here
        // per new built-in; the `./indicators/*` export pattern covers the rest.
        'indicators/sma': resolve(root, 'src/indicators/sma.ts'),
        'indicators/ema': resolve(root, 'src/indicators/ema.ts'),
        'indicators/bollinger': resolve(root, 'src/indicators/bollinger.ts'),
        'indicators/rsi': resolve(root, 'src/indicators/rsi.ts'),
        'indicators/macd': resolve(root, 'src/indicators/macd.ts'),
        'indicators/atr': resolve(root, 'src/indicators/atr.ts'),
        'indicators/stochastic': resolve(root, 'src/indicators/stochastic.ts'),
        'indicators/volumeMa': resolve(root, 'src/indicators/volumeMa.ts'),
        'indicators/wma': resolve(root, 'src/indicators/wma.ts'),
        'indicators/vwap': resolve(root, 'src/indicators/vwap.ts'),
        'indicators/williamsR': resolve(root, 'src/indicators/williamsR.ts'),
        'indicators/cci': resolve(root, 'src/indicators/cci.ts'),
        'indicators/roc': resolve(root, 'src/indicators/roc.ts'),
        'indicators/obv': resolve(root, 'src/indicators/obv.ts'),
        'indicators/keltner': resolve(root, 'src/indicators/keltner.ts'),
        'indicators/adx': resolve(root, 'src/indicators/adx.ts'),
        chrome: resolve(root, 'src/chrome/index.ts'),
        annotations: resolve(root, 'src/annotations/index.ts'),
        'annotations/schema': resolve(root, 'src/annotations/schema.ts'),
        'price-lines': resolve(root, 'src/priceLines/index.ts'),
        'event-tags': resolve(root, 'src/eventTags/index.ts'),
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

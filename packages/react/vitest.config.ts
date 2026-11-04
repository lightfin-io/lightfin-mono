import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

const root = import.meta.dirname

/**
 * The wrapper's tests mock `lightfin-web-chart` wholesale (jsdom has no canvas
 * 2D context), so they never touch the real engine. The alias lets Vitest
 * resolve the specifier to the core source without a prior build; the mock
 * replaces it before any of it runs.
 */
export default defineConfig({
  resolve: {
    alias: {
      'lightfin-web-chart': resolve(root, '../core/src/index.ts'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
})

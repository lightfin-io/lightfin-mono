import { defineConfig } from 'vitest/config'

/**
 * Unit tests target pure logic (decimation, tick selection, scale math,
 * indicator equivalence). Node environment by default; tests that
 * need the DOM can opt in per-file with a `// @vitest-environment jsdom`
 * pragma.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.{test,spec}.ts'],
  },
})

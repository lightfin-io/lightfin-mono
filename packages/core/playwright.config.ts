import { defineConfig, devices } from '@playwright/test'

const PORT = 4174

/**
 * Browser tests against the /demo playground: real pointer input
 * through pan, zoom, crosshair, pane resizing, and resize. Unit-level logic
 * stays in Vitest.
 */
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    viewport: { width: 1200, height: 800 },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `bunx vite --config vite.demo.config.ts --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    env: { BROWSER: 'none' },
  },
})

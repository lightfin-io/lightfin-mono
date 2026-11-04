import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

import type { CrosshairMoveEvent } from '../src'
import { openDemo } from './helpers'

declare global {
  interface Window {
    crosshair: CrosshairMoveEvent | null
  }
}

test.beforeEach(async ({ page }) => {
  await openDemo(page)
  await page.evaluate(() => {
    window.crosshair = null
    window.chart.on('crosshairMove', e => (window.crosshair = e))
  })
})

const crosshairIndex = (page: Page) =>
  page.evaluate(() => window.crosshair?.index ?? null)
const lastIndex = (page: Page) =>
  page.evaluate(() => window.chart.getSeries()!.store.lastIndex)

test('the chart is a labelled, described, focusable group', async ({
  page,
}) => {
  const chart = page.getByRole('group', {
    name: 'Mock Coin / US Dollar, candlestick chart',
  })
  await expect(chart).toHaveAttribute('aria-roledescription', 'chart')
  await chart.focus()
  await expect(chart).toHaveAccessibleDescription(
    /^Showing .+ to .+, \d+ bars\. High [\d.]+, low [\d.]+, last close [\d.]+\. Arrow keys/,
  )

  await page.evaluate(() => window.chart.getSeries()!.setChartType('line'))
  await expect(page.locator('.lf-chart')).toHaveAccessibleName(
    'Mock Coin / US Dollar, line chart',
  )
})

test('arrow keys walk the crosshair bar by bar and announce each bar', async ({
  page,
}) => {
  await page.locator('.lf-chart').focus()
  const last = await lastIndex(page)

  await page.keyboard.press('ArrowLeft')
  expect(await crosshairIndex(page)).toBe(last)
  await page.keyboard.press('ArrowLeft')
  expect(await crosshairIndex(page)).toBe(last - 1)
  await page.keyboard.press('Shift+ArrowLeft')
  expect(await crosshairIndex(page)).toBe(last - 11)
  await page.keyboard.press('ArrowRight')
  expect(await crosshairIndex(page)).toBe(last - 10)

  const live = page.locator('.lf-chart [aria-live="polite"]')
  await expect(live).toHaveText(
    /^\w{3} \d+ \d\d:\d\d: open [\d.]+, high [\d.]+, low [\d.]+, close [\d.]+, volume [\d,.]+$/,
  )

  await page.keyboard.press('End')
  expect(await crosshairIndex(page)).toBe(last)
  await page.keyboard.press('Escape')
  expect(await crosshairIndex(page)).toBeNull()
})

test('Home scrolls back to the oldest loaded bar', async ({ page }) => {
  await page.locator('.lf-chart').focus()
  await page.keyboard.press('Home')
  const { index, first, visibleFrom } = await page.evaluate(() => {
    const chart = window.chart
    return {
      index: window.crosshair?.index,
      first: chart.getSeries()!.store.firstIndex,
      visibleFrom: chart.timeScale().scrollIndex,
    }
  })
  // Reaching the oldest bar may backfill more history before it.
  expect(index).toBeGreaterThanOrEqual(first)
  expect(index).toBeGreaterThanOrEqual(Math.floor(visibleFrom))
})

test('plus and minus zoom', async ({ page }) => {
  const barWidth = () => page.evaluate(() => window.chart.timeScale().barWidth)
  await page.locator('.lf-chart').focus()
  const start = await barWidth()
  await page.keyboard.press('+')
  expect(await barWidth()).toBeCloseTo(start * 1.25, 5)
  await page.keyboard.press('-')
  await page.keyboard.press('-')
  expect(await barWidth()).toBeCloseTo(start / 1.25, 5)
})

test('the mouse takes the crosshair back from the keyboard', async ({
  page,
}) => {
  await page.locator('.lf-chart').focus()
  await page.keyboard.press('ArrowLeft')
  await page.keyboard.press('ArrowLeft')
  const box = (await page.locator('.lf-chart').boundingBox())!
  await page.mouse.move(box.x + 100, box.y + 100)
  const index = await page.evaluate(() => window.crosshair?.index)
  const expected = await page.evaluate(() =>
    window.chart.timeScale().nearestIndex(100),
  )
  expect(index).toBe(expected)
})

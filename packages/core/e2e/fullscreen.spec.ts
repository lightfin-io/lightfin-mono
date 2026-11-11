import { expect, test } from '@playwright/test'

import { openDemo } from './helpers'

test('the fullscreen button sits to the right of the exchange clock and toggles', async ({
  page,
}) => {
  await openDemo(page)
  const chart = page.locator('#chart')
  const clock = page.locator('.lf-clock')
  const button = page.getByRole('button', { name: /fullscreen/i })

  const chartBox = await chart.boundingBox()
  const clockBox = await clock.boundingBox()
  const buttonBox = await button.boundingBox()
  expect(chartBox).toBeTruthy()
  expect(clockBox).toBeTruthy()
  expect(buttonBox).toBeTruthy()
  expect(buttonBox!.x).toBeGreaterThan(clockBox!.x + clockBox!.width - 1)
  expect(buttonBox!.x + buttonBox!.width).toBeGreaterThan(
    chartBox!.x + chartBox!.width - 24,
  )

  await button.click()
  await expect(button).toHaveAttribute('aria-pressed', 'true')
  await expect(button).toHaveAccessibleName('Exit fullscreen')
  await expect
    .poll(() => page.evaluate(() => document.fullscreenElement?.id ?? null))
    .toBe('chart')
  const full = await chart.boundingBox()
  expect(full!.width).toBeGreaterThan(chartBox!.width)
  expect(full!.height).toBeGreaterThan(chartBox!.height)

  await button.click()
  await expect(button).toHaveAttribute('aria-pressed', 'false')
  await expect(button).toHaveAccessibleName('Fullscreen')
  await expect
    .poll(() => page.evaluate(() => document.fullscreenElement?.id ?? null))
    .toBeNull()
  const restored = await chart.boundingBox()
  expect(restored!.width).toBeCloseTo(chartBox!.width, 0)
  expect(restored!.height).toBeCloseTo(chartBox!.height, 0)
})

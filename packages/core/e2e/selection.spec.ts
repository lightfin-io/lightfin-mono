import { expect, test } from '@playwright/test'

import { openDemo } from './helpers'

test('panning across the legend and toolbar does not select their labels', async ({
  page,
}) => {
  await openDemo(page)
  const chartBox = (await page.locator('.lf-chart').boundingBox())!
  const legendBox = (await page.locator('.lf-hud-legend').boundingBox())!
  const toolbarBox = (await page.locator('.lf-toolbar-top').boundingBox())!
  const before = await page.evaluate(() => window.chart.timeScale().scrollIndex)

  // Start on the plot, drag across the OHLC legend, and finish in the toolbar.
  await page.mouse.move(legendBox.x + 16, chartBox.y + chartBox.height * 0.45)
  await page.mouse.down()
  await page.mouse.move(
    legendBox.x + legendBox.width * 0.85,
    legendBox.y + legendBox.height / 2,
    { steps: 8 },
  )
  await page.mouse.move(
    toolbarBox.x + toolbarBox.width - 24,
    toolbarBox.y + toolbarBox.height / 2,
    { steps: 8 },
  )
  await page.mouse.up()

  expect(
    await page.evaluate(() => window.chart.timeScale().scrollIndex),
  ).not.toBe(before)
  expect(
    await page.evaluate(() => window.getSelection()?.toString() ?? ''),
  ).toBe('')
})

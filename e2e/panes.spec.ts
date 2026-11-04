import { expect, test } from '@playwright/test'

import { layout, nextFrame, openDemo } from './helpers'

test.beforeEach(async ({ page }) => {
  await openDemo(page)
})

test('dragging the main pane divider resizes the first sub-pane', async ({
  page,
}) => {
  const before = await layout(page)
  const x = before.origin.x + before.main.width / 2
  const y = before.origin.y + before.panes[0]!.top

  await page.mouse.move(x, y)
  await nextFrame(page)
  await expect(page.locator('.lf-chart')).toHaveCSS('cursor', 'row-resize')

  await page.mouse.down()
  await page.mouse.move(x, y - 60, { steps: 5 })
  await page.mouse.up()

  const after = await layout(page)
  expect(after.panes[0]!.height).toBeCloseTo(before.panes[0]!.height + 60, 0)
  expect(after.main.height).toBeCloseTo(before.main.height - 60, 0)
  expect(after.panes[1]!.height).toBeCloseTo(before.panes[1]!.height, 0)
})

test('dragging between sub-panes trades height between them', async ({
  page,
}) => {
  const before = await layout(page)
  const x = before.origin.x + before.main.width / 2
  const y = before.origin.y + before.panes[1]!.top

  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x, y + 30, { steps: 5 })
  await page.mouse.up()

  const after = await layout(page)
  expect(after.main.height).toBeCloseTo(before.main.height, 0)
  expect(after.panes[0]!.height).toBeCloseTo(before.panes[0]!.height + 30, 0)
  expect(after.panes[1]!.height).toBeCloseTo(before.panes[1]!.height - 30, 0)
})

test('a sub-pane stops shrinking at its minimum height', async ({ page }) => {
  const before = await layout(page)
  const x = before.origin.x + before.main.width / 2
  const y = before.origin.y + before.panes[1]!.top

  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x, y + 500, { steps: 5 })
  await page.mouse.up()

  const after = await layout(page)
  expect(after.panes[1]!.height).toBeCloseTo(32, 0)
})

test('dragging a divider does not pan the chart', async ({ page }) => {
  const scroll = () => page.evaluate(() => window.chart.timeScale().scrollIndex)
  const before = await layout(page)
  const start = await scroll()
  const x = before.origin.x + before.main.width / 2
  const y = before.origin.y + before.panes[0]!.top

  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x - 150, y - 40, { steps: 5 })
  await page.mouse.up()

  expect(await scroll()).toBe(start)
})

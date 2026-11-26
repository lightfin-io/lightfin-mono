import { expect, test } from '@playwright/test'

import { layout, nextFrame, openDemo } from './helpers'

test.beforeEach(async ({ page }) => {
  await openDemo(page)
})

test('the pane toolbar appears across the pane and stays at the right edge', async ({
  page,
}) => {
  const { origin, main, panes } = await layout(page)
  const pane = panes[0]!
  const header = page.locator('.lf-hud-pane').first()
  const toolbar = header.locator('.lf-hud-actions')
  const values = header.locator('.lf-hud-values')
  const x = origin.x + pane.width / 2
  const y = origin.y + pane.top

  await page.mouse.move(x, origin.y + main.height / 2)
  await expect(toolbar).toHaveCSS('opacity', '0')
  await page.mouse.move(x, y + pane.height / 2)
  await expect(toolbar).toHaveCSS('opacity', '1')
  const before = (await toolbar.boundingBox())!
  expect(origin.x + pane.width - (before.x + before.width)).toBeCloseTo(8)

  await expect(values).toHaveText(/\d+\.\d{2}/)
  await page.evaluate(() => {
    const chart = window.chart
    const period = chart.getSeries()!.store.size + 1
    chart.paneLayout().panes[0]!.indicator.setOptions({ period })
  })
  await expect(values).toHaveText('—')
  await expect(toolbar).toHaveCSS('opacity', '1')
  expect(await toolbar.boundingBox()).toEqual(before)

  await page.mouse.move(origin.x + 1, y + pane.height - 2)
  await expect(toolbar).toHaveCSS('opacity', '1')
  await page.mouse.move(x, origin.y + panes[1]!.top + panes[1]!.height / 2)
  await expect(toolbar).toHaveCSS('opacity', '0')
})

test('tabbing directly to a pane button reveals its toolbar', async ({
  page,
}) => {
  const pane = page.getByRole('group', { name: /^RSI .* pane$/ })
  const toolbar = pane.locator('.lf-hud-actions')
  await expect(toolbar).toHaveCSS('opacity', '0')

  await page.locator('.lf-hud-legend .lf-btn').last().focus()
  await page.keyboard.press('Tab')
  const hide = pane.getByRole('button', { name: /^Hide RSI/ })
  await expect(hide).toBeFocused()
  await expect(hide).toHaveCSS('outline-style', 'solid')
  await expect(toolbar).toHaveCSS('opacity', '1')

  await page.keyboard.press('Space')
  await expect(pane.getByRole('button', { name: /^Show RSI/ })).toBeFocused()

  await page.keyboard.press('Tab')
  await expect(
    pane.getByRole('button', { name: /^Settings RSI/ }),
  ).toBeFocused()
  await expect(toolbar).toHaveCSS('opacity', '1')
})

test('the pane toolbar moves a sub-pane up with its height', async ({
  page,
}) => {
  const initial = await layout(page)
  const x = initial.origin.x + initial.main.width / 2
  const y = initial.origin.y + initial.panes[0]!.top
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x, y - 60, { steps: 5 })
  await page.mouse.up()
  const before = await layout(page)

  const paneOrder = () =>
    page.evaluate(() =>
      window.chart.paneLayout().panes.map(pane => pane.indicator.name),
    )
  const moveUp = page.getByRole('button', { name: /^Move pane up/ })
  await expect(moveUp).toHaveCount(1)
  await expect(moveUp).toHaveAccessibleName(/^Move pane up MACD/)
  await page.mouse.move(x, before.origin.y + before.panes[1]!.top + 12)
  await moveUp.click()

  expect(await paneOrder()).toEqual(['MACD', 'RSI'])
  const after = await layout(page)
  expect(after.main.height).toBeCloseTo(before.main.height)
  expect(after.panes[0]!.height).toBeCloseTo(before.panes[1]!.height)
  expect(after.panes[1]!.height).toBeCloseTo(before.panes[0]!.height)
  await expect(moveUp).toHaveAccessibleName(/^Move pane up RSI/)
  await expect(page.getByRole('button', { name: /^Hide MACD/ })).toBeFocused()

  await page.getByRole('button', { name: /^Remove MACD/ }).click()
  await expect(moveUp).toHaveCount(0)
  expect(await paneOrder()).toEqual(['RSI'])
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

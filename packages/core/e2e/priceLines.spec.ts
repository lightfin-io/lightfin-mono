import { expect, test } from '@playwright/test'

import { layout, nextFrame, openDemo } from './helpers'

test('place an order from the "+" button and drag its line', async ({
  page,
}) => {
  await openDemo(page)
  const { origin, main } = await layout(page)
  const midX = origin.x + main.width / 2
  const y = origin.y + main.top + main.height * 0.4

  // The "+" button rides the crosshair line at the right edge of the pane.
  await page.mouse.move(midX, y)
  await page.mouse.move(origin.x + main.width - 8, y, { steps: 4 })
  await page.mouse.click(origin.x + main.width - 8, y)
  await page.getByRole('button', { name: 'Place' }).click()

  const priceAt = (py: number) =>
    page.evaluate(py => window.chart.coordinateToPrice(py), py)
  const placed = await page.evaluate(() => window.orders[0]!.options.price)
  expect(placed).toBeCloseTo(await priceAt(y - origin.y), 2)

  await page.mouse.move(midX, y)
  await nextFrame(page)
  await expect(page.locator('.lf-chart')).toHaveCSS('cursor', 'ns-resize')

  const scrollBefore = await page.evaluate(
    () => window.chart.timeScale().scrollIndex,
  )
  await page.mouse.down()
  await page.mouse.move(midX - 100, y - 50, { steps: 5 })
  await page.mouse.up()

  const dragged = await page.evaluate(() => window.orders[0]!.options.price)
  const expected = await priceAt(y - 50 - origin.y)
  // The demo snaps to whole cents while dragging.
  expect(dragged).toBeCloseTo(Math.round(expected * 100) / 100, 2)
  expect(Math.round(dragged * 100) / 100).toBe(dragged)
  expect(await page.evaluate(() => window.chart.timeScale().scrollIndex)).toBe(
    scrollBefore,
  )
})

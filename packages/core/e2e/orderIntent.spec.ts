import { expect, test } from '@playwright/test'

import { layout, nextFrame, openDemo } from './helpers'

test('the crosshair order button follows the pointer after page scroll', async ({
  page,
}) => {
  await openDemo(page)
  const before = await layout(page)

  // Scroll the chart in the viewport while keeping its dimensions fixed.
  await page.evaluate(() => {
    const spacer = document.createElement('div')
    spacer.style.height = 'calc(100vh + 160px)'
    document.body.append(spacer)
    window.scrollTo(0, 160)
  })
  await nextFrame(page)
  const { origin, main } = await layout(page)
  expect(origin.y).toBe(before.origin.y - 160)
  expect(main).toEqual(before.main)

  // The button follows the crosshair just inside the price axis.
  const x = origin.x + main.width - 8
  const y = Math.round(origin.y + main.top + main.height * 0.65)
  const expectedPrice = await page.evaluate(y => {
    const chart = window.chart
    return chart.formatPrice(chart.coordinateToPrice(y))
  }, y - origin.y)

  await page.mouse.move(x, y)
  await nextFrame(page)
  await page.mouse.click(x, y)
  await expect(page.locator('.order-popup')).toContainText(
    `Limit @ ${expectedPrice}`,
  )
})

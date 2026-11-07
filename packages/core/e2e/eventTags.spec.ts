import { expect, test } from '@playwright/test'

import { layout, nextFrame, openDemo } from './helpers'

test('click an event tag to open the host detail card', async ({ page }) => {
  await openDemo(page)
  await page.waitForFunction(() => window.chartEvents?.length > 0)
  const { origin, main } = await layout(page)

  // The tag sits at the bottom of the main pane, centered on its event time.
  const first = await page.evaluate(() => window.chartEvents[0]!)
  const x = await page.evaluate(
    t => window.chart.timeToCoordinate(t)!,
    first.time,
  )
  const tagX = origin.x + x
  const tagY = origin.y + main.top + main.height - 14

  // Hover shows the pointer cursor; clicking opens the demo's card, and a
  // click away from it dismisses it — a pan never starts from the tag.
  await page.mouse.move(tagX, tagY)
  await nextFrame(page)
  await expect(page.locator('.lf-chart')).toHaveCSS('cursor', 'pointer')

  const scrollBefore = await page.evaluate(
    () => window.chart.timeScale().scrollIndex,
  )
  await page.mouse.click(tagX, tagY)
  const popup = page.locator('.event-popup')
  await expect(popup).toBeVisible()
  await expect(popup).toContainText(first.title!)
  expect(await page.evaluate(() => window.chart.timeScale().scrollIndex)).toBe(
    scrollBefore,
  )

  await page.mouse.click(origin.x + main.width / 2, origin.y + main.height / 2)
  await expect(popup).toBeHidden()
})

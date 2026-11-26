import { expect, test } from '@playwright/test'

import { layout, openDemo } from './helpers'

test('the return button appears over the main pane beyond the buffer and resumes following', async ({
  page,
}) => {
  await openDemo(page)
  const button = page.getByRole('button', { name: 'Jump to latest bar' })
  const { origin, main, panes } = await layout(page)
  const x = origin.x + main.width / 2
  const y = origin.y + main.height / 2
  const initial = await page.evaluate(() => {
    const chart = window.chart
    const { barWidth, scrollIndex } = chart.timeScale()
    const lastIndex = chart.getSeries()!.store.lastIndex
    const gap = chart.plotRect().width - (lastIndex - scrollIndex) * barWidth
    const rightmost =
      lastIndex +
      1 +
      chart.getOptions().rightOffset -
      chart.plotRect().width / barWidth
    return { barWidth, rightmost, gap }
  })

  await page.mouse.move(x, y)
  await expect(button).toBeHidden()
  await page.mouse.down()
  await page.mouse.move(x + initial.gap + 12, y)
  await expect(button).toBeHidden()
  await page.mouse.move(x + initial.gap + 80, y)
  await page.mouse.up()
  await expect(button).toHaveCSS('opacity', '0.85')

  const box = (await button.boundingBox())!
  expect(box.x + box.width).toBeCloseTo(origin.x + main.width - 8, 0)
  expect(box.y + box.height).toBeCloseTo(origin.y + main.height - 8, 0)

  const indicator = panes[0]!
  await page.mouse.move(x, origin.y + indicator.top + indicator.height / 2)
  await expect(button).toHaveCSS('opacity', '0')
  await page.mouse.move(origin.x + main.width + 4, y)
  await expect(button).toHaveCSS('opacity', '0')
  await page.mouse.move(x, origin.y - 4)
  await expect(button).toHaveCSS('opacity', '0')

  // Moving the main pane updates the hover area even with a stationary pointer.
  await page.mouse.move(x, origin.y + 40)
  await expect(button).toHaveCSS('opacity', '0.85')
  await page.evaluate(() => window.chart.movePaneDown())
  await expect(button).toHaveCSS('opacity', '0')
  const moved = (await layout(page)).main
  await page.mouse.move(x, origin.y + moved.top + moved.height / 2)
  await expect(button).toHaveCSS('opacity', '0.85')
  const movedBox = (await button.boundingBox())!
  expect(movedBox.y + movedBox.height).toBeCloseTo(
    origin.y + moved.top + moved.height - 8,
    0,
  )

  await button.hover()
  await expect(button).toHaveCSS('opacity', '1')
  await button.click()
  await expect(button).toBeHidden()

  const result = await page.evaluate(() => {
    const chart = window.chart
    const scale = chart.timeScale()
    const { barWidth, scrollIndex } = scale
    const series = chart.getSeries()!
    const last = series.bars().at(-1)!
    series.update({ ...last, time: last.time + 60 })
    return { barWidth, scrollIndex, afterUpdate: scale.scrollIndex }
  })
  expect(result.barWidth).toBe(initial.barWidth)
  expect(result.scrollIndex).toBeCloseTo(initial.rightmost, 6)
  expect(result.afterUpdate).toBeCloseTo(initial.rightmost + 1, 6)
})

test('Tab reveals the return button via chart focus and Enter returns focus to the chart', async ({
  page,
}) => {
  await openDemo(page)
  const chart = page.getByRole('group', {
    name: 'Mock Coin / US Dollar, candlestick chart',
  })
  const button = page.getByRole('button', { name: 'Jump to latest bar' })
  const latestTime = await page.evaluate(
    () => window.chart.visibleTimeRange()?.to,
  )
  await chart.focus()
  await page.keyboard.press('Home')
  await page.keyboard.press('Shift+Tab')
  await expect(button).toHaveCSS('opacity', '0')
  await page.keyboard.press('Tab')
  await expect(chart).toBeFocused()
  await expect(button).toHaveCSS('opacity', '1')

  await page.keyboard.press('Tab')
  await expect(button).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(button).toBeHidden()
  await expect(chart).toBeFocused()
  expect(await page.evaluate(() => window.chart.visibleTimeRange()?.to)).toBe(
    latestTime,
  )
})

test('host CSS can override control styles and Chrome theme defaults', async ({
  page,
}) => {
  await openDemo(page)
  const style = await page.addStyleTag({
    content: `
      #chart.lf-host {
        --lf-textStrong: #bfdbfe;
        --lf-panel: #182230;
      }
      #chart .lf-latest-button { border-radius: 50%; }
    `,
  })
  await style.evaluate(el => document.head.prepend(el))

  const chart = page.locator('.lf-chart')
  await chart.focus()
  await page.keyboard.press('Home')
  const button = page.getByRole('button', { name: 'Jump to latest bar' })
  await expect(button).toHaveCSS('border-radius', '50%')
  await expect(button).toHaveCSS('background-color', 'rgb(24, 34, 48)')
  await expect(button).toHaveCSS('color', 'rgb(191, 219, 254)')
  await expect(page.locator('.lf-hud-title')).toHaveCSS(
    'color',
    'rgb(191, 219, 254)',
  )
})

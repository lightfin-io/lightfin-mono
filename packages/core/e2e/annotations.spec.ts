import { expect, test } from '@playwright/test'

import { layout, nextFrame, openDemo } from './helpers'

test("AI annotations replace each other as a group and keep the user's", async ({
  page,
}) => {
  await openDemo(page)
  const mine = await page.evaluate(() => {
    const range = window.chart.visibleTimeRange()!
    return window.drawings.add({
      type: 'vline',
      points: [{ time: range.from, price: 0 }],
    })
  })

  const button = page.getByRole('button', { name: 'AI annotate' })
  await button.click()
  const ai = await page.evaluate(() => ({
    range: window.chart.visibleTimeRange()!,
    drawings: window.drawings.list('ai'),
  }))
  expect(ai.drawings.map(a => a.id)).toEqual([
    'resistance',
    'support',
    'swing-high',
    'swing-low',
    'trend',
    'retracement',
  ])
  // Anchored to bars on screen.
  for (const { time } of ai.drawings.flatMap(a => a.points)) {
    expect(time).toBeGreaterThanOrEqual(ai.range.from)
    expect(time).toBeLessThanOrEqual(ai.range.to)
  }

  // The caption sits just above the line at the pane's right edge, and a
  // click on it selects the drawing.
  await nextFrame(page)
  const { origin, main } = await layout(page)
  const lineY = await page.evaluate(
    price => window.chart.priceToCoordinate(price),
    ai.drawings[0]!.points[0]!.price,
  )
  await page.mouse.click(origin.x + main.width - 30, origin.y + lineY - 10)
  expect(await page.evaluate(() => window.drawings.selected)).toBe('resistance')

  await page.getByRole('button', { name: 'Clear AI drawings' }).click()
  expect(
    await page.evaluate(() => window.drawings.list().map(a => a.id)),
  ).toEqual([mine])
})

test('a malformed batch is rejected whole with a message naming the problems', async ({
  page,
}) => {
  await openDemo(page)
  const message = await page.evaluate(() => {
    const time = window.chart.visibleTimeRange()!.to
    try {
      window.drawings.replace('ai', [
        { type: 'hline', points: [{ time, price: 100 }] },
        { type: 'marker', points: [{ time: time * 1000, price: 100 }] },
      ])
    } catch (e) {
      return (e as Error).message
    }
    return null
  })
  expect(message).toContain('[1] points[0].time looks like milliseconds')
  expect(await page.evaluate(() => window.drawings.list())).toEqual([])
})

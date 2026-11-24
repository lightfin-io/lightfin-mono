import { expect, test } from '@playwright/test'

import { layout, openDemo } from './helpers'

test('Gann Fan rays extend past the slope anchor and can be selected', async ({
  page,
}) => {
  await openDemo(page)
  const { origin, main } = await layout(page)
  const at = (x: number, y: number) =>
    [
      origin.x + main.left + main.width * x,
      origin.y + main.top + main.height * y,
    ] as const

  await page.getByRole('button', { name: 'More Fibonacci and Gann' }).click()
  await page.getByRole('menuitem', { name: 'Gann Fan' }).click()
  await page.mouse.move(...at(0.2, 0.65))
  await page.mouse.down()
  await page.mouse.move(...at(0.36, 0.59), { steps: 4 })
  await page.mouse.up()

  const [fan] = await page.evaluate(() => window.drawings.toJSON())
  expect(fan).toMatchObject({ type: 'gannFan' })
  expect(fan!.points).toHaveLength(2)
  await expect(page.getByRole('button', { name: 'Font' })).toBeVisible()
  const { forward, backward } = await page.evaluate(({ points: [a, b] }) => {
    const { x, y } = window.chart.element.getBoundingClientRect()
    const ax = window.chart.timeToCoordinate(a!.time)!
    const ay = window.chart.priceToCoordinate(a!.price)
    const dx = window.chart.timeToCoordinate(b!.time)! - ax
    const dy = window.chart.priceToCoordinate(b!.price) - ay
    const onOneByTwo = (t: number) =>
      [x + ax + t * dx, y + ay + t * dy * 2] as const
    window.drawings.select(null)
    return { forward: onOneByTwo(2.5), backward: onOneByTwo(-0.6) }
  }, fan!)
  await page.mouse.click(...backward)
  const selected = () => page.evaluate(() => window.drawings.selected)
  expect(await selected()).toBeNull()
  await page.mouse.click(...forward)
  expect(await selected()).toBe(fan!.id)
})

const patterns = [
  {
    title: 'Elliott Impulse',
    type: 'elliottImpulse',
    anchors: [
      [0.2, 0.7],
      [0.3, 0.52],
      [0.4, 0.61],
      [0.52, 0.42],
      [0.62, 0.5],
      [0.74, 0.33],
    ],
  },
  {
    title: 'Elliott Correction',
    type: 'elliottCorrection',
    anchors: [
      [0.21, 0.38],
      [0.37, 0.57],
      [0.52, 0.47],
      [0.7, 0.65],
    ],
  },
  {
    title: 'Head and Shoulders',
    type: 'headAndShoulders',
    anchors: [
      [0.22, 0.62],
      [0.32, 0.4],
      [0.45, 0.75],
      [0.59, 0.42],
      [0.7, 0.63],
    ],
  },
] as const

for (const { title, type, anchors } of patterns) {
  test(`${title} waits for every anchor and saves edited anchors`, async ({
    page,
  }) => {
    await openDemo(page)
    const { origin, main } = await layout(page)
    const at = ([x, y]: readonly [number, number]) =>
      [
        origin.x + main.left + main.width * x,
        origin.y + main.top + main.height * y,
      ] as const
    const drawings = () => page.evaluate(() => window.drawings.toJSON())

    await page.getByRole('button', { name: 'More patterns' }).click()
    await page.getByRole('menuitem', { name: title }).click()
    for (const point of anchors.slice(0, -1))
      await page.mouse.click(...at(point))
    expect(await drawings()).toEqual([])

    const last = anchors.at(-1)!
    await page.mouse.click(...at(last))
    const [original] = await drawings()
    expect(original).toMatchObject({ type })
    expect(original!.points).toHaveLength(anchors.length)
    await expect(page.getByRole('button', { name: 'Cursor' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )

    if (type === 'headAndShoulders') {
      const neckline = await page.evaluate(({ points }) => {
        const { x, y } = window.chart.element.getBoundingClientRect()
        const left = points[1]!
        const right = points[3]!
        window.drawings.select(null)
        return [
          x +
            (window.chart.timeToCoordinate(left.time)! +
              window.chart.timeToCoordinate(right.time)!) /
              2,
          y + window.chart.priceToCoordinate((left.price + right.price) / 2),
        ] as const
      }, original!)
      await page.mouse.click(...neckline)
      expect(await page.evaluate(() => window.drawings.selected)).toBe(
        original!.id,
      )
    }

    await page.mouse.move(...at(last))
    await page.mouse.down()
    await page.mouse.move(...at([last[0], last[1] + 0.07]), { steps: 4 })
    await page.mouse.up()
    const [edited] = await drawings()
    expect(edited!.points.slice(0, -1)).toEqual(original!.points.slice(0, -1))
    expect(edited!.points.at(-1)!.price).toBeLessThan(
      original!.points.at(-1)!.price,
    )

    await page.getByRole('button', { name: 'Undo', exact: true }).click()
    expect(await drawings()).toEqual([original])
    await page.getByRole('button', { name: 'Redo', exact: true }).click()
    await page.reload()
    await page.waitForFunction(() => window.drawings !== undefined)
    expect(await drawings()).toEqual([edited])
  })
}

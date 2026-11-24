import { expect, test } from '@playwright/test'

import { layout, openDemo } from './helpers'

test('a parallel channel is drawn from the toolbar flyout with a drag and a click', async ({
  page,
}) => {
  await openDemo(page)
  const { origin, main } = await layout(page)
  const at = (fx: number, fy: number) =>
    [
      origin.x + main.left + main.width * fx,
      origin.y + main.top + main.height * fy,
    ] as const

  await page.getByRole('button', { name: 'More channels' }).click()
  await page.getByRole('menuitem', { name: 'Parallel channel' }).click()
  await page.mouse.move(...at(0.2, 0.6))
  await page.mouse.down()
  await page.mouse.move(...at(0.5, 0.4), { steps: 5 })
  await page.mouse.up()
  await page.mouse.move(...at(0.4, 0.7), { steps: 3 })
  await page.mouse.click(...at(0.4, 0.7))

  const drawn = await page.evaluate(() => ({
    list: window.drawings.list(),
    selected: window.drawings.selected,
    tool: window.drawings.tool,
  }))
  expect(drawn.list).toHaveLength(1)
  expect(drawn.list[0]!.type).toBe('channel')
  expect(drawn.list[0]!.points).toHaveLength(3)
  expect(drawn.selected).toBe(drawn.list[0]!.id)
  expect(drawn.tool).toBeNull()
  await expect(page.getByRole('button', { name: 'Line color' })).toBeVisible()
})

test('the brush records a freehand stroke', async ({ page }) => {
  await openDemo(page)
  const { origin, main } = await layout(page)
  await page.getByRole('button', { name: 'More shapes' }).click()
  await page.getByRole('menuitem', { name: 'Brush' }).click()

  const x = origin.x + main.left + main.width * 0.3
  const y = origin.y + main.top + main.height * 0.5
  await page.mouse.move(x, y)
  await page.mouse.down()
  for (let i = 1; i <= 20; i++) {
    await page.mouse.move(x + i * 8, y + Math.sin(i / 2) * 30)
  }
  await page.mouse.up()

  const [stroke] = await page.evaluate(() => window.drawings.list())
  expect(stroke!.type).toBe('brush')
  expect(stroke!.points.length).toBeGreaterThan(5)
})

test("the floating toolbar restyles a text label's font, size, and color", async ({
  page,
}) => {
  await openDemo(page)
  const id = await page.evaluate(() => {
    const range = window.chart.visibleTimeRange()!
    const { main } = window.chart.paneLayout()
    const price = window.chart.coordinateToPrice(main.top + main.height / 2)!
    const id = window.drawings.add({
      type: 'text',
      points: [{ time: Math.round((range.from + range.to) / 2), price }],
      text: 'Note',
    })
    window.drawings.select(id)
    return id
  })

  await page.getByRole('button', { name: 'Font' }).click()
  await page.getByRole('menuitemradio', { name: '24' }).click()
  await page.getByRole('button', { name: 'Bold' }).click()
  await page.getByRole('button', { name: 'Font' }).click()
  await page.getByRole('menuitemradio', { name: 'Monospace' }).click()
  await page.getByRole('button', { name: 'Text color' }).click()
  await page.getByRole('button', { name: '#ff9800' }).click()

  const style = await page.evaluate(id => window.drawings.get(id)!.style, id)
  expect(style).toMatchObject({ fontSize: 24, bold: true, color: '#ff9800' })
  expect(style.fontFamily).toContain('monospace')
  await expect(page.getByRole('button', { name: 'Bold' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )

  // Styles picked for a tool carry over to its next drawing.
  await page.getByRole('button', { name: 'Text', exact: true }).click()
  expect(
    await page.evaluate(() => window.drawings.toolPreset?.style),
  ).toMatchObject({ fontSize: 24, bold: true, color: '#ff9800' })
})

test('chart options and drawing-tool defaults reset independently', async ({
  page,
}) => {
  await openDemo(page)
  await page.evaluate(() => {
    const { from, to } = window.chart.visibleTimeRange()!
    const id = window.drawings.add({
      type: 'trendline',
      points: [
        { time: from, price: 100 },
        { time: to, price: 101 },
      ],
    })
    window.drawings.select(id)
  })
  await page.getByRole('button', { name: 'Line width' }).click()
  await page.getByRole('menuitemradio', { name: '4px' }).click()
  const drawings = await page.evaluate(() => window.drawings.toJSON())

  const magnet = page.getByRole('button', { name: 'Magnet' })
  const line = page.getByRole('button', { name: 'Line', exact: true })
  const trigger = page.getByRole('button', { name: 'Reset settings' })
  const dialog = page.getByRole('dialog', { name: 'Reset settings' })
  const preset = () => page.evaluate(() => window.drawings.toolPreset?.style)
  await magnet.click()
  await line.click()
  await page.getByRole('button', { name: 'More lines' }).click()
  await page.getByRole('menuitem', { name: 'Ray', exact: true }).click()
  expect(await preset()).toEqual({ extend: 'end', lineWidth: 4 })

  await trigger.click()
  await dialog.getByRole('button', { name: 'Reset chart options' }).click()
  await expect(dialog.getByRole('status')).toHaveText('Chart options reset.')
  await dialog.getByRole('button', { name: 'Close' }).click()
  await expect(magnet).toHaveAttribute('aria-pressed', 'false')
  await expect(page.getByRole('button', { name: 'Candles' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  expect(await preset()).toEqual({ extend: 'end', lineWidth: 4 })

  await magnet.click()
  await line.click()
  await trigger.click()
  await dialog
    .getByRole('button', { name: 'Reset drawing-tool defaults' })
    .click()
  await expect(dialog.getByRole('status')).toHaveText(
    'Drawing-tool defaults reset.',
  )
  await page.keyboard.press('Escape')
  await expect(trigger).toBeFocused()
  await expect(magnet).toHaveAttribute('aria-pressed', 'true')
  await expect(line).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('button', { name: 'Cursor' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  expect(await preset()).toBeUndefined()
  expect(await page.evaluate(() => window.drawings.toJSON())).toEqual(drawings)
  await expect(
    page.getByRole('button', { name: 'Undo', exact: true }),
  ).toBeEnabled()

  await page.getByRole('button', { name: 'Ray', exact: true }).click()
  expect(await preset()).toEqual({ extend: 'end' })
})

test('clone, undo, and redo from the toolbar and keyboard', async ({
  page,
}) => {
  await openDemo(page)
  await page.evaluate(() => {
    const range = window.chart.visibleTimeRange()!
    const { main } = window.chart.paneLayout()
    const price = window.chart.coordinateToPrice(main.top + main.height / 2)!
    const id = window.drawings.add({
      type: 'rectangle',
      points: [
        { time: range.from, price: price * 0.98 },
        { time: range.to, price: price * 1.02 },
      ],
    })
    window.drawings.select(id)
  })

  await page.getByRole('button', { name: 'More', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Clone' }).click()
  const count = () => page.evaluate(() => window.drawings.list().length)
  expect(await count()).toBe(2)

  await page.locator('.lf-chart').focus()
  await page.keyboard.press('ControlOrMeta+z')
  expect(await count()).toBe(1)
  await page.keyboard.press('ControlOrMeta+Shift+z')
  expect(await count()).toBe(2)

  // Undoing the clone dropped its selection; the toolbar follows the next one.
  await expect(page.getByRole('button', { name: 'Delete' })).toBeHidden()
  await page.evaluate(() =>
    window.drawings.select(window.drawings.list()[0]!.id),
  )
  await page.getByRole('button', { name: 'Delete' }).click()
  expect(await count()).toBe(1)
})

test('drawing backups restore independently of the demo autosave', async ({
  page,
}) => {
  await openDemo(page)
  const trigger = page.getByRole('button', { name: 'Drawing backups' })
  const dialog = page.getByRole('dialog', { name: 'Drawing backups' })
  const save = dialog.getByRole('button', { name: 'Save backup' })
  const restore = dialog.getByRole('button', { name: 'Restore backup' })
  const status = dialog.getByRole('status')
  const undo = page.getByRole('button', { name: 'Undo', exact: true })
  const readDrawings = () => page.evaluate(() => window.drawings.toJSON())

  await trigger.click()
  await restore.click()
  await expect(status).toHaveText('No drawing backup has been saved.')
  expect(await readDrawings()).toEqual([])
  await page.keyboard.press('Escape')
  await expect(trigger).toBeFocused()

  await page.evaluate(() => {
    const { from, to } = window.chart.visibleTimeRange()!
    window.drawings.add({
      type: 'fib',
      points: [
        { time: from, price: 95 },
        { time: to, price: 105 },
      ],
      hidden: true,
      hiddenLevels: [0.5],
    })
  })
  const backup = await readDrawings()
  await trigger.click()
  await save.click()
  await expect(status).toHaveText('Drawing backup saved.')
  await dialog.getByRole('button', { name: 'Close' }).click()
  await page.getByRole('button', { name: 'Remove all drawings' }).click()
  expect(await readDrawings()).toEqual([])
  await expect(undo).toBeEnabled()

  await trigger.click()
  await restore.click()
  await expect(status).toHaveText('Drawing backup restored.')
  expect(await readDrawings()).toEqual(backup)
  await dialog.getByRole('button', { name: 'Close' }).click()
  await expect(undo).toBeDisabled()

  await page.reload()
  await page.waitForFunction(() => window.drawings !== undefined)
  expect(await readDrawings()).toEqual(backup)
})

test('drawing settings save exact anchors and Fibonacci levels together', async ({
  page,
}) => {
  await openDemo(page)
  const original = await page.evaluate(() => {
    const { from, to } = window.chart.visibleTimeRange()!
    const id = window.drawings.add({
      type: 'fib',
      points: [
        { time: from, price: 100 },
        { time: to, price: 101 },
      ],
    })
    window.drawings.select(id)
    return window.drawings.get(id)!
  })
  const settings = page.getByRole('button', { name: 'Drawing settings' })
  const dialog = page.getByRole('dialog', { name: 'Drawing settings' })
  const time = dialog.getByRole('spinbutton', { name: 'Time (Unix seconds)' })
  const price = dialog.getByRole('spinbutton', { name: 'Price' })
  const level = dialog.getByRole('checkbox', { name: '0.5', exact: true })
  const anchor = dialog.getByRole('combobox', { name: 'Anchor' })
  const apply = dialog.getByRole('button', { name: 'Apply' })
  const read = () => page.evaluate(id => window.drawings.get(id), original.id)

  await settings.click()
  await expect(anchor).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  await expect(apply).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(anchor).toBeFocused()
  await expect(level).toBeChecked()
  await price.fill('100.125')
  await anchor.selectOption('1')
  const secondTime = original.points[1]!.time - 17
  await time.fill(String(secondTime * 1000))
  await level.uncheck()
  await apply.click()
  await expect(dialog.getByRole('alert')).toContainText(
    'looks like milliseconds',
  )
  expect(await read()).toEqual(original)

  await time.fill(String(secondTime))
  await apply.click()
  await expect(settings).toBeFocused()
  const edited = {
    ...original,
    points: [
      { ...original.points[0], price: 100.125 },
      { ...original.points[1], time: secondTime },
    ],
    hiddenLevels: [0.5],
  }
  expect(await read()).toEqual(edited)
  await settings.click()
  await expect(level).not.toBeChecked()
  await level.check()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  expect(await read()).toEqual(edited)

  await page.evaluate(() => window.drawings.undo())
  expect(await read()).toEqual(original)
  await page.evaluate(() => window.drawings.redo())
  expect(await read()).toEqual(edited)
})

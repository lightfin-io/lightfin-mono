import { expect, test } from '@playwright/test'

import type { ChartType } from '../src'
import { nextFrame, openDemo } from './helpers'

test('the chart type menu switches renderers without changing the viewport', async ({
  page,
}) => {
  const errors: Error[] = []
  page.on('pageerror', error => errors.push(error))
  await openDemo(page)
  const trigger = page.getByRole('button', { name: /^Chart type:/ })
  const menu = page.getByRole('menu', { name: 'Chart type' })
  const viewport = () => page.evaluate(() => window.chart.visibleTimeRange())
  const original = await viewport()
  const styles: [ChartType, string][] = [
    ['hollowCandles', 'Hollow candles'],
    ['volumeCandles', 'Volume candles'],
    ['bar', 'Bars'],
    ['highLow', 'High-low'],
    ['heikinAshi', 'Heikin Ashi'],
    ['line', 'Line'],
    ['lineWithMarkers', 'Line with markers'],
    ['stepLine', 'Step line'],
    ['area', 'Area'],
    ['hlcArea', 'HLC area'],
    ['baseline', 'Baseline'],
    ['columns', 'Columns'],
    ['candlestick', 'Candles'],
  ]
  for (const [type, label] of styles) {
    await trigger.click()
    await menu.getByRole('menuitemradio', { name: label, exact: true }).click()
    await expect(menu).toBeHidden()
    await expect(trigger).toHaveAccessibleName(`Chart type: ${label}`)
    await nextFrame(page)
    expect(await page.evaluate(() => window.chart.getSeries()?.chartType)).toBe(
      type,
    )
    expect(await viewport()).toEqual(original)
  }
  expect(errors).toEqual([])
})

test('the chart type menu supports keyboard navigation and reflects API changes', async ({
  page,
}) => {
  await openDemo(page)
  const trigger = page.getByRole('button', { name: /^Chart type:/ })
  const menu = page.getByRole('menu', { name: 'Chart type' })

  await trigger.press('ArrowDown')
  await expect(
    menu.getByRole('menuitemradio', { name: 'Candles', exact: true }),
  ).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(
    menu.getByRole('menuitemradio', { name: 'Hollow candles' }),
  ).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(trigger).toBeFocused()

  await page.evaluate(() => window.chart.getSeries()?.setChartType('stepLine'))
  await trigger.press('Enter')
  const selected = menu.getByRole('menuitemradio', {
    name: 'Step line',
    checked: true,
  })
  await expect(selected).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(menu).toBeHidden()
  await expect(trigger).toBeFocused()
})

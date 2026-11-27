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

test('menus and scrollbars use their own colors', async ({ page }) => {
  await openDemo(page)
  const host = page.locator('.lf-host')
  await expect(host).toHaveCSS('scrollbar-width', 'thin')
  const colors = await host.evaluate(el => {
    const probe = document.createElement('div')
    el.append(probe)
    const read = (name: string) => {
      probe.style.color = `var(${name})`
      return getComputedStyle(probe).color
    }
    const readColors = {
      background: read('--lf-background'),
      overlay: read('--lf-overlayBg'),
      border: read('--lf-overlayDivColor'),
      text: read('--lf-overlayTextColor'),
      scrollbar: read('--lf-scrollbarColor'),
      track: read('--lf-scrollbarTrackColor'),
    }
    probe.remove()
    return readColors
  })
  expect(
    new Set([
      colors.background,
      colors.overlay,
      colors.border,
      colors.scrollbar,
      colors.track,
    ]).size,
  ).toBe(5)

  await page.getByRole('button', { name: /^Chart type:/ }).click()
  const menu = page.getByRole('menu', { name: 'Chart type' })
  await expect(menu).toHaveCSS('background-color', colors.overlay)
  await expect(menu).toHaveCSS('color', colors.text)
  await expect(menu).toHaveCSS('border-top-color', colors.border)
  await expect(menu).toHaveCSS('scrollbar-width', 'thin')
  await expect(menu.getByRole('separator').first()).toHaveCSS(
    'border-top-color',
    colors.border,
  )

  await host.evaluate(el => {
    el.style.setProperty('--lf-overlayDivColor', '#334455')
  })
  await expect(menu).toHaveCSS('border-top-color', 'rgb(51, 68, 85)')
  await expect(menu.getByRole('separator').first()).toHaveCSS(
    'border-top-color',
    'rgb(51, 68, 85)',
  )
})

test('the columns chart shows small moves in high prices', async ({ page }) => {
  await openDemo(page)
  await page.evaluate(() => {
    const chart = window.chart
    for (const indicator of chart.indicators()) indicator.remove()
    const bars = [60_400, 60_500, 60_700].map((close, index) => ({
      time: 1_700_000_000 + index * 60,
      open: close - 10,
      high: close + 20,
      low: close - 20,
      close,
      volume: 100,
    }))
    chart.setDataSource({
      getBars: ({ before }) => (before === undefined ? bars : []),
    })
  })
  await page.waitForFunction(
    () => window.chart.getSeries()?.bars()[0]?.close === 60_400,
  )
  await page.getByRole('button', { name: /^Chart type:/ }).click()
  await page.getByRole('menuitemradio', { name: 'Columns' }).click()
  await nextFrame(page)

  const priceSpan = await page.evaluate(() => {
    const chart = window.chart
    const pixels =
      chart.priceToCoordinate(60_400) - chart.priceToCoordinate(60_700)
    return pixels / chart.paneLayout().main.height
  })
  expect(priceSpan).toBeGreaterThan(0.7)
})

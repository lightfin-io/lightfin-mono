import { expect, test } from '@playwright/test'

import { openDemo } from './helpers'

test('loads overlays and pane indicators from the Indicators menu', async ({ page }) => {
  await openDemo(page)
  const button = page.getByRole('button', { name: 'Indicators', exact: true })

  for (const [label, name, placement] of [
    ['Donchian Channels', 'Donchian', 'price'],
    ['Supertrend', 'Supertrend', 'price'],
    ['Stochastic RSI', 'Stoch RSI', 'pane'],
    ['Volume-Weighted Moving Average (VWMA)', 'VWMA', 'price'],
    ['Money Flow Index (MFI)', 'MFI', 'pane'],
    ['Choppiness Index (CHOP)', 'CHOP', 'pane'],
  ] as const) {
    await button.click()
    await page.getByRole('menuitem', { name: label, exact: true }).click()
    await expect
      .poll(() =>
        page.evaluate(name => {
          const chart = window.chart
          const handle = chart
            .indicators()
            .find(indicator => indicator.name === name)
          if (!handle) return null
          const index = chart.getSeries()!.store.lastIndex
          return {
            placement: handle.placement,
            hasValue: handle.plots.some(plot =>
              Number.isFinite(handle.value(plot.key, index)),
            ),
          }
        }, name),
      )
      .toEqual({ placement, hasValue: true })
  }
})

import type { Page } from '@playwright/test'

import type { Chart, PlotRect } from '../src'
import type { PriceLine } from '../src/priceLines'

declare global {
  interface Window {
    chart: Chart
    /** Limit-order lines placed through the demo's "+" popup. */
    orders: PriceLine[]
  }
}

/**
 * Open the demo on its offline mock feed with live ticks off, once its bars
 * and indicators have loaded.
 */
export async function openDemo(
  page: Page,
  query = 'feed=mock&live=0',
): Promise<void> {
  await page.goto(`/?${query}`)
  await page.waitForFunction(
    () => 'volumeMa' in window && window.chart.getSeries()!.store.size > 0,
  )
}

export interface Layout {
  /** The chart element's top-left in viewport px. */
  origin: { x: number; y: number }
  main: PlotRect
  panes: PlotRect[]
}

export function layout(page: Page): Promise<Layout> {
  return page.evaluate(() => {
    const box = window.chart.element.getBoundingClientRect()
    const { main, panes } = window.chart.paneLayout()
    return {
      origin: { x: box.left, y: box.top },
      main,
      panes: panes.map(p => p.rect),
    }
  })
}

/** Resolve once the chart has painted the latest changes. */
export function nextFrame(page: Page): Promise<void> {
  return page.evaluate(
    () =>
      new Promise<void>(resolve =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  )
}

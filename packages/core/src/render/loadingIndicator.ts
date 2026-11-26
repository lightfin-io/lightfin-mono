import type { PlotRect } from '../chart/chart'
import type { ChartTheme } from '../chart/options'

/**
 * A spinner centered over the main pane while a {@link DataSource}'s initial
 * page is in flight. The stylesheet animates it while visible.
 */
export class LoadingIndicator {
  private readonly el: HTMLDivElement

  constructor(root: HTMLElement, theme: ChartTheme) {
    const el = root.ownerDocument.createElement('div')
    el.className = 'lf-chart-loading'
    el.hidden = true
    el.style.setProperty('--lf-chart-loading-track', theme.axisBorderColor)
    el.style.setProperty('--lf-chart-loading-accent', theme.lineColor)
    root.appendChild(el)
    this.el = el
  }

  /** Re-center over a pane rect (the main pane), e.g. on resize/layout change. */
  reposition(rect: PlotRect): void {
    this.el.style.left = `${rect.left + rect.width / 2}px`
    this.el.style.top = `${rect.top + rect.height / 2}px`
  }

  show(): void {
    this.el.hidden = false
  }

  hide(): void {
    this.el.hidden = true
  }

  dispose(): void {
    this.el.remove()
  }
}

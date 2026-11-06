import type { PlotRect } from '../chart/chart'

const SIZE = 28
const BORDER = 3

/**
 * A spinner centered over the main pane while a {@link DataSource}'s initial
 * page is in flight. Plain DOM positioned over the canvas stack, spun with
 * the Web Animations API — no stylesheet or render-loop invalidation needed,
 * and it costs nothing while hidden.
 */
export class LoadingIndicator {
  private readonly el: HTMLDivElement
  private animation: Animation | null = null

  constructor(root: HTMLElement) {
    const el = document.createElement('div')
    el.style.position = 'absolute'
    el.style.width = `${SIZE}px`
    el.style.height = `${SIZE}px`
    el.style.marginLeft = `${-SIZE / 2}px`
    el.style.marginTop = `${-SIZE / 2}px`
    el.style.borderRadius = '50%'
    el.style.boxSizing = 'border-box'
    el.style.pointerEvents = 'none'
    el.style.display = 'none'
    root.appendChild(el)
    this.el = el
  }

  /** Track and accent colors, e.g. the theme's axis border and line color. */
  setColors(track: string, accent: string): void {
    this.el.style.border = `${BORDER}px solid ${track}`
    this.el.style.borderTopColor = accent
  }

  /** Re-center over a pane rect (the main pane), e.g. on resize/layout change. */
  reposition(rect: PlotRect): void {
    this.el.style.left = `${rect.left + rect.width / 2}px`
    this.el.style.top = `${rect.top + rect.height / 2}px`
  }

  show(): void {
    this.el.style.display = ''
    this.animation ??= this.el.animate(
      [{ transform: 'rotate(0deg)' }, { transform: 'rotate(360deg)' }],
      { duration: 700, iterations: Infinity },
    )
  }

  hide(): void {
    this.el.style.display = 'none'
    this.animation?.cancel()
    this.animation = null
  }

  dispose(): void {
    this.animation?.cancel()
    this.el.remove()
  }
}

import type { ChartOptions } from '../chart/options'

/** A native button so Tab, Enter, and Space work over the canvas stack. */
export function createLatestButton(
  root: HTMLElement,
  options: ChartOptions,
): HTMLButtonElement {
  const button = root.ownerDocument.createElement('button')
  button.type = 'button'
  button.className = 'lf-latest-button'
  button.title = 'Jump to latest bar'
  button.setAttribute('aria-label', button.title)
  button.textContent = '→'
  button.hidden = true
  const { theme } = options
  button.style.right = `${options.priceAxisWidth}px`
  button.style.setProperty('--lf-latest-border', theme.axisBorderColor)
  button.style.setProperty('--lf-latest-background', theme.background)
  button.style.setProperty('--lf-latest-color', theme.textStrong)
  button.style.setProperty('--lf-latest-font', theme.fontFamily)
  // Leave pointer activation to the button instead of starting a chart gesture.
  button.addEventListener('pointerdown', e => e.stopPropagation())
  root.append(button)
  return button
}

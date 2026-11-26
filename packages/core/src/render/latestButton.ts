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
  button.style.right = `${options.priceAxisWidth}px`
  // Leave pointer activation to the button instead of starting a chart gesture.
  button.addEventListener('pointerdown', e => e.stopPropagation())
  root.append(button)
  return button
}

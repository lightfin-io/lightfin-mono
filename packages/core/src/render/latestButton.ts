import type { ChartOptions } from '../chart/options'

/** A native button so Tab, Enter, and Space work over the canvas stack. */
export function createLatestButton(
  root: HTMLElement,
  options: ChartOptions,
): HTMLButtonElement {
  const styles = document.createElement('style')
  // Opacity keeps the button in the tab order while the pointer is away.
  styles.textContent = `
    .lf-latest-button[hidden] { display: none; }
    .lf-latest-button { opacity: 0; pointer-events: none; }
    :hover > .lf-latest-button:where([data-pane-hover]) { opacity: 0.85; pointer-events: auto; }
    .lf-latest-button:hover,
    :focus-visible > .lf-latest-button,
    .lf-latest-button:focus-visible { opacity: 1; pointer-events: auto; }
  `

  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'lf-latest-button'
  button.title = 'Jump to latest bar'
  button.setAttribute('aria-label', button.title)
  button.textContent = '→'
  button.hidden = true
  const { theme } = options
  Object.assign(button.style, {
    position: 'absolute',
    zIndex: '2', // Above the optional pane HUD.
    right: `${options.priceAxisWidth}px`,
    margin: '0 8px 8px 0',
    width: '32px',
    height: '32px',
    padding: '0',
    borderRadius: '4px',
    border: `1px solid var(--lf-panelBorderColor, ${theme.axisBorderColor})`,
    background: `var(--lf-panel, ${theme.background})`,
    color: theme.textStrong,
    font: `20px ${theme.fontFamily}`,
    cursor: 'pointer',
  })
  // Leave pointer activation to the button instead of starting a chart gesture.
  button.addEventListener('pointerdown', e => e.stopPropagation())
  root.append(styles, button)
  return button
}

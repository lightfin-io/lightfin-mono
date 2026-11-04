/** Create an element with an optional class and text. */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

/** A toolbar/menu button. `icon` is one of {@link ICONS}; `label` is visible text. */
export function button(
  opts: { label?: string; icon?: keyof typeof ICONS; title?: string },
  onClick: (e: MouseEvent) => void,
): HTMLButtonElement {
  const b = el('button', opts.label ? 'lf-btn' : 'lf-btn lf-btn-icon')
  b.type = 'button'
  if (opts.icon) b.innerHTML = ICONS[opts.icon]
  if (opts.label) b.append(opts.label)
  if (opts.title) {
    b.title = opts.title
    b.setAttribute('aria-label', opts.title)
  }
  b.addEventListener('click', onClick)
  return b
}

const svg = (body: string): string =>
  `<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`

/** Inline 18×18 stroke icons (static strings; no external assets). */
export const ICONS = {
  candlestick: svg(
    '<path d="M5.5 2.5v3M5.5 12v3.5M12.5 2.5v5M12.5 13v2.5"/><rect x="3.5" y="5.5" width="4" height="6.5" rx=".5"/><rect x="10.5" y="7.5" width="4" height="5.5" rx=".5" fill="currentColor"/>',
  ),
  bar: svg(
    '<path d="M5.5 3v12M3.5 6h2M5.5 12h2M12.5 2.5v11M10.5 10h2M12.5 5h2"/>',
  ),
  line: svg('<path d="M2.5 13.5l4-5 3 3 6-8"/>'),
  area: svg(
    '<path d="M2.5 12l4-5 3 3 6-7v12.5h-13z" fill="currentColor" fill-opacity=".25"/><path d="M2.5 12l4-5 3 3 6-7"/>',
  ),
  indicators: svg(
    '<path d="M2.5 14.5c3-.5 3.5-10 6.5-10s3.5 6 6.5 6"/><path d="M2.5 3v12.5H16"/>',
  ),
  calendar: svg(
    '<rect x="2.5" y="3.5" width="13" height="12" rx="1.5"/><path d="M2.5 7.5h13M6 2v3M12 2v3"/>',
  ),
  eye: svg(
    '<path d="M1.5 9s3-5.5 7.5-5.5S16.5 9 16.5 9 13.5 14.5 9 14.5 1.5 9 1.5 9z"/><circle cx="9" cy="9" r="2.25"/>',
  ),
  eyeOff: svg(
    '<path d="M2.5 2.5l13 13M7.4 7.4a2.25 2.25 0 003.2 3.2M5 5.2C2.9 6.6 1.5 9 1.5 9s3 5.5 7.5 5.5c1.4 0 2.7-.5 3.8-1.2M14.6 11.9C15.9 10.6 16.5 9 16.5 9S13.5 3.5 9 3.5c-.6 0-1.2.1-1.8.2"/>',
  ),
  settings: svg(
    '<circle cx="9" cy="9" r="2.25"/><path d="M9 1.75v2M9 14.25v2M3.87 3.87l1.42 1.42M12.71 12.71l1.42 1.42M1.75 9h2M14.25 9h2M3.87 14.13l1.42-1.42M12.71 5.29l1.42-1.42"/>',
  ),
  close: svg('<path d="M4.5 4.5l9 9M13.5 4.5l-9 9"/>'),
} as const

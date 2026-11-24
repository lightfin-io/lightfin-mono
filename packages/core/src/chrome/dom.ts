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

/** A popover entry: an icon and/or label, with `role` for menus (default `menuitem`). */
export function menuItem(
  opts: { label: string; icon?: keyof typeof ICONS; role?: string },
  onClick: (e: MouseEvent) => void,
): HTMLButtonElement {
  const b = button({ icon: opts.icon }, onClick)
  b.className = 'lf-btn'
  b.append(opts.label)
  b.setAttribute('role', opts.role ?? 'menuitem')
  return b
}

/** Inline SVG icons (static strings; no external assets). */
export const ICONS = {
  candlestick: `<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M5.5 2.5v3M5.5 12v3.5M12.5 2.5v5M12.5 13v2.5"/>
    <rect x="3.5" y="5.5" width="4" height="6.5" rx=".5"/>
    <rect x="10.5" y="7.5" width="4" height="5.5" rx=".5" fill="currentColor"/>
  </svg>`,
  bar: `<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M5.5 3v12M3.5 6h2M5.5 12h2M12.5 2.5v11M10.5 10h2M12.5 5h2"/>
  </svg>`,
  line: `<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M2.5 13.5l4-5 3 3 6-8"/>
  </svg>`,
  area: `<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M2.5 12l4-5 3 3 6-7v12.5h-13z" fill="currentColor" fill-opacity=".25"/>
    <path d="M2.5 12l4-5 3 3 6-7"/>
  </svg>`,
  indicators: `<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M2.5 14.5c3-.5 3.5-10 6.5-10s3.5 6 6.5 6"/>
    <path d="M2.5 3v12.5H16"/>
  </svg>`,
  calendar: `<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <rect x="2.5" y="3.5" width="13" height="12" rx="1.5"/>
    <path d="M2.5 7.5h13M6 2v3M12 2v3"/>
  </svg>`,
  fullscreen: `<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M3.5 7V3.5H7M11 3.5h3.5V7M14.5 11v3.5H11M7 14.5H3.5V11"/>
  </svg>`,
  exitFullscreen: `<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M7 3.5V7H3.5M11 3.5V7h3.5M14.5 11H11v3.5M7 14.5V11H3.5"/>
  </svg>`,
  eye: `<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M1.5 9s3-5.5 7.5-5.5S16.5 9 16.5 9 13.5 14.5 9 14.5 1.5 9 1.5 9z"/>
    <circle cx="9" cy="9" r="2.25"/>
  </svg>`,
  eyeOff: `<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M2.5 2.5l13 13M7.4 7.4a2.25 2.25 0 003.2 3.2M5 5.2C2.9 6.6 1.5 9 1.5 9s3 5.5 7.5 5.5c1.4 0 2.7-.5 3.8-1.2M14.6 11.9C15.9 10.6 16.5 9 16.5 9S13.5 3.5 9 3.5c-.6 0-1.2.1-1.8.2"/>
  </svg>`,
  settings: `<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <circle cx="9" cy="9" r="2.25"/>
    <path d="M9 1.75v2M9 14.25v2M3.87 3.87l1.42 1.42M12.71 12.71l1.42 1.42M1.75 9h2M14.25 9h2M3.87 14.13l1.42-1.42M12.71 5.29l1.42-1.42"/>
  </svg>`,
  resetSettings: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 448">
  <g fill="currentColor" fill-rule="evenodd">
    <path d="M121.858 158.999H29V66.144h18.57v74.285h74.288z"/>
    <path d="M224 419c-107.48 0-195-87.52-195-195h18.57c0 97.268 79.162 176.43 176.43 176.43S400.43 321.268 400.43 224 321.268 47.57 224 47.57c-48.054 0-93.09 19.036-126.517 53.511l-52.467 55.017-13.462-12.769 52.463-55.133C121.161 50.01 170.84 29 224 29c107.48 0 195 87.52 195 195s-87.52 195-195 195"/>
    <path fill-rule="nonzero" d="M224 289.001c-35.866 0-65.001-29.136-65.001-65.001s29.136-65.001 65.001-65.001 65.001 29.136 65.001 65.001-29.136 65.001-65.001 65.001m0-111.428c-25.65 0-46.427 20.777-46.427 46.427S198.35 270.427 224 270.427 270.427 249.65 270.427 224 249.65 177.573 224 177.573"/>
  </g>
</svg>`,
  close: `<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M4.5 4.5l9 9M13.5 4.5l-9 9"/>
  </svg>`,
  search: `<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <circle cx="7.75" cy="7.75" r="4.75"/>
    <path d="M11.5 11.5l3.5 3.5"/>
  </svg>`,
  cursor: `<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M5 2.5v11l3-2.75 2 4.5 2-.9-2-4.4h4z"/>
  </svg>`,
  trendline: `<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M5 13l8-8"/>
    <circle cx="3.75" cy="14.25" r="1.75"/>
    <circle cx="14.25" cy="3.75" r="1.75"/>
  </svg>`,
  hline: `<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M1.5 9h5.75M10.75 9h5.75"/>
    <circle cx="9" cy="9" r="1.75"/>
  </svg>`,
  vline: `<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M9 1.5v5.75M9 10.75v5.75"/>
    <circle cx="9" cy="9" r="1.75"/>
  </svg>`,
  rectangle: `<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <rect x="2.5" y="4.5" width="13" height="9" rx="1"/>
  </svg>`,
  fib: `<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M2 3.5h14M2 7h14M2 10.5h14M2 14.5h14"/>
    <path d="M4 14.5L14 3.5" stroke-dasharray="1.5 2"/>
  </svg>`,
  text: `<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M4 5V3.5h10V5M9 3.5v11M7 14.5h4"/>
  </svg>`,
  trash: `<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M3 5h12M7 5V3.5h4V5M4.5 5l.75 10h7.5l.75-10M7.5 8v4.5M10.5 8v4.5"/>
  </svg>`,
  undo: `<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M6.5 4L3 7.5 6.5 11M3 7.5h7a4 4 0 010 8H8"/>
  </svg>`,
  redo: `<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M11.5 4L15 7.5 11.5 11M15 7.5H8a4 4 0 000 8h2"/>
  </svg>`,
  ray: `<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M5 13l2.75-2.75M10.25 7.75L16.5 1.5"/>
    <circle cx="3.75" cy="14.25" r="1.75"/>
    <circle cx="9" cy="9" r="1.75"/>
  </svg>`,
  extendedLine: `<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M1.5 16.5l3.75-3.75M7.75 10.25l2.5-2.5M12.75 5.25L16.5 1.5"/>
    <circle cx="6.5" cy="11.5" r="1.6"/>
    <circle cx="11.5" cy="6.5" r="1.6"/>
  </svg>`,
  arrow: `<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M3 15L14.5 3.5M8.5 3.5h6v6"/>
  </svg>`,
  hray: `<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M5.25 9H16.5"/>
    <circle cx="3.5" cy="9" r="1.75"/>
  </svg>`,
  crossline: `<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M1.5 9h5.75M10.75 9h5.75M9 1.5v5.75M9 10.75v5.75"/>
    <circle cx="9" cy="9" r="1.75"/>
  </svg>`,
  channel: `<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M2 10.5L16 3.5M2 15.5L16 8.5"/>
    <path d="M2 13L16 6" stroke-dasharray="1.5 2"/>
  </svg>`,
  regression: `<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M2 9L16 2.5M2 15.5L16 9"/>
    <path d="M2 12.25L16 5.75" stroke-dasharray="1.5 2"/>
    <circle cx="5" cy="12" r=".6" fill="currentColor"/>
    <circle cx="12" cy="8" r=".6" fill="currentColor"/>
  </svg>`,
  pitchfork: `<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M4 9h12.5M8 4.5h8.5M8 13.5h8.5M8 4.5v9"/>
    <circle cx="2.75" cy="9" r="1.25"/>
  </svg>`,
  fibExtension: `<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M8.5 3.5H16M8.5 7H16M8.5 10.5H16M8.5 14.5H16"/>
    <path d="M2 14.5L4.5 5 7 12" stroke-dasharray="1.5 2"/>
  </svg>`,
  gannFan: `<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M2 16 8 2M2 16 12 2M2 16 16 2M2 16l14-10M2 16l14-6"/>
  </svg>`,
  elliottImpulse: `<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="m1.5 15 3-5 2.5 2.5L11 5l2.5 2.5L16.5 2"/>
  </svg>`,
  elliottCorrection: `<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="m2 3 5 8 4-4 5 8"/>
  </svg>`,
  headAndShoulders: `<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="m1.5 12 2-5L6 12l3-9 3 9 2.5-5 2 5"/>
    <path d="M6 12h6" stroke-dasharray="1.5 2"/>
  </svg>`,
  ellipse: `<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <ellipse cx="9" cy="9" rx="6.75" ry="4.75"/>
  </svg>`,
  triangle: `<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M9 3l6.75 11.5H2.25z"/>
  </svg>`,
  brush: `<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M2.5 13.5c2-3 3-6.5 5-6.5s1.5 5 3.5 5 2.5-5 4.5-7"/>
  </svg>`,
  highlighter: `<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M3 13c2.5-2.5 4.5-4 7-4s3 1 5-1.5" stroke-width="4" stroke-opacity=".4"/>
    <path d="M3 13c2.5-2.5 4.5-4 7-4s3 1 5-1.5"/>
  </svg>`,
  callout: `<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M4 3h10.5a1 1 0 011 1v5.5a1 1 0 01-1 1H9L5 14.5v-4H4a1 1 0 01-1-1V4a1 1 0 011-1z"/>
  </svg>`,
  priceLabel: `<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M2 9l3.75-4.5h10v9h-10z"/>
    <circle cx="6" cy="9" r=".9" fill="currentColor"/>
  </svg>`,
  arrowUpMark: `<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M9 2.5L14 8h-3v7.5H7V8H4z"/>
  </svg>`,
  arrowDownMark: `<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M9 15.5L14 10h-3V2.5H7V10H4z"/>
  </svg>`,
  flag: `<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M4.5 16V2.5M4.5 3h9.5l-3 3 3 3H4.5"/>
  </svg>`,
  longPosition: `<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <rect x="2.5" y="2.5" width="13" height="13" rx="1"/>
    <path d="M2.5 11h13M9 8.5V5M7 7l2-2 2 2"/>
  </svg>`,
  shortPosition: `<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <rect x="2.5" y="2.5" width="13" height="13" rx="1"/>
    <path d="M2.5 7h13M9 9.5V13M7 11l2 2 2-2"/>
  </svg>`,
  measure: `<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M9 2.5v13M2.5 9h13M6.75 4.75L9 2.5l2.25 2.25M13.25 6.75L15.5 9l-2.25 2.25"/>
  </svg>`,
  magnet: `<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M4 2.5v6.5a5 5 0 0010 0V2.5h-3V9a2 2 0 01-4 0V2.5zM4 5.5h3M11 5.5h3"/>
  </svg>`,
  stayDrawing: `<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M3 15l.75-3L11 4.75 13.25 7 6 14.25zM9.5 6.25l2.25 2.25"/>
    <path d="M12.5 15.5a3 3 0 003-3"/>
  </svg>`,
  lock: `<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <rect x="3.75" y="8" width="10.5" height="7.5" rx="1.25"/>
    <path d="M6 8V5.75a3 3 0 016 0V8"/>
  </svg>`,
  unlock: `<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <rect x="3.75" y="8" width="10.5" height="7.5" rx="1.25"/>
    <path d="M6 8V5.75a3 3 0 015.75-1.2"/>
  </svg>`,
  more: `<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <circle cx="4" cy="9" r="1" fill="currentColor"/>
    <circle cx="9" cy="9" r="1" fill="currentColor"/>
    <circle cx="14" cy="9" r="1" fill="currentColor"/>
  </svg>`,
  clone: `<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <rect x="6.5" y="6.5" width="9" height="9" rx="1"/>
    <path d="M11.5 4V3.5a1 1 0 00-1-1h-7a1 1 0 00-1 1v7a1 1 0 001 1H4"/>
  </svg>`,
  lineColor: `<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M3.5 13L13 3.5l1.5 1.5L5 14.5H3.5z"/>
  </svg>`,
  fill: `<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M3 9.5L8.5 4l5.5 5.5-4.5 4.5a1.5 1.5 0 01-2 0zM6 2l2.5 2M14.5 12.5s1.25 1.5 1.25 2.25a1.25 1.25 0 01-2.5 0c0-.75 1.25-2.25 1.25-2.25z"/>
  </svg>`,
  textColor: `<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M4.5 14L9 3l4.5 11M6.25 10h5.5"/>
  </svg>`,
  lineEnds: `<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M2 9h9.5"/>
    <path d="M11 5.5L15.5 9 11 12.5z" fill="currentColor"/>
  </svg>`,
  grip: `<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <g fill="currentColor" stroke="none">
      <circle cx="7" cy="4.5" r="1"/>
      <circle cx="11" cy="4.5" r="1"/>
      <circle cx="7" cy="9" r="1"/>
      <circle cx="11" cy="9" r="1"/>
      <circle cx="7" cy="13.5" r="1"/>
      <circle cx="11" cy="13.5" r="1"/>
    </g>
  </svg>`,
}

export type IconName = keyof typeof ICONS

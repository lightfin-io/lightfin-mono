import { el, menuItem } from './dom'

const HUES = [
  '#f23645',
  '#ff9800',
  '#ffeb3b',
  '#4caf50',
  '#089981',
  '#00bcd4',
  '#2962ff',
  '#673ab7',
  '#9c27b0',
  '#e91e63',
]

const hex2 = (n: number) =>
  Math.round(Math.max(0, Math.min(255, n)))
    .toString(16)
    .padStart(2, '0')

const rgbOf = (hex: string) =>
  [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)) as [
    number,
    number,
    number,
  ]

/** `hex` moved toward white (t > 0) or black (t < 0) by |t|. */
function shade(hex: string, t: number): string {
  const target = t > 0 ? 255 : 0
  const k = Math.abs(t)
  return `#${rgbOf(hex)
    .map(c => hex2(c + (target - c) * k))
    .join('')}`
}

/** A gray ramp, then each hue from light tints to dark shades. */
const PALETTE = [
  ...Array.from({ length: 10 }, (_, i) => shade('#ffffff', -i / 9)),
  ...[0.7, 0.45, 0, -0.3, -0.55].flatMap(t => HUES.map(h => shade(h, t))),
]

/** A color as `#rrggbb` and an opacity, or null when it can't be read. */
export function parseColor(
  color: string,
): { hex: string; alpha: number } | null {
  const c = color.trim()
  let m = c.match(/^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i)
  if (m) {
    let h = m[1]!.toLowerCase()
    if (h.length <= 4) h = [...h].map(d => d + d).join('')
    return {
      hex: `#${h.slice(0, 6)}`,
      alpha: h.length === 8 ? parseInt(h.slice(6), 16) / 255 : 1,
    }
  }
  m = c.match(
    /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)$/i,
  )
  if (m) {
    const a = m[4]
    return {
      hex: `#${[m[1], m[2], m[3]].map(v => hex2(Number(v))).join('')}`,
      alpha:
        a === undefined ? 1 : a.endsWith('%') ? parseFloat(a) / 100 : Number(a),
    }
  }
  // Named and other CSS colors: let the canvas normalize them.
  const ctx = document.createElement('canvas').getContext?.('2d')
  if (!ctx) return null
  ctx.fillStyle = '#000'
  ctx.fillStyle = c
  const norm = String(ctx.fillStyle)
  return norm === c ? null : parseColor(norm)
}

/** `#rrggbb`, with an alpha byte when not opaque. */
export function formatColor(hex: string, alpha: number): string {
  return alpha >= 1 ? hex : `${hex}${hex2(alpha * 255)}`
}

/**
 * A color picker's contents: the palette, a custom color input, and an
 * opacity slider (applied on release). `pick` gets the chosen CSS color; a
 * palette click also closes. `none`, when given, adds a "None" entry.
 */
export function colorPicker(
  current: string | undefined,
  pick: (color: string) => void,
  opts: { close(): void; none?: () => void },
): HTMLElement[] {
  const parsed = current ? parseColor(current) : null
  let base = parsed?.hex ?? HUES[6]!
  let alpha = parsed ? Math.round(parsed.alpha * 100) / 100 : 1

  const grid = el('div', 'lf-colors')
  for (const color of PALETTE) {
    const b = el('button', 'lf-color')
    b.type = 'button'
    b.style.setProperty('--lf-swatch-color', color)
    b.title = color
    b.setAttribute('aria-label', color)
    b.setAttribute('aria-pressed', String(!!parsed && color === base))
    b.addEventListener('click', () => {
      pick(formatColor(color, alpha))
      opts.close()
    })
    grid.append(b)
  }

  const row = el('div', 'lf-color-row')
  const custom = el('input', 'lf-input')
  custom.type = 'color'
  custom.value = base
  custom.title = 'Custom color'
  custom.setAttribute('aria-label', 'Custom color')
  custom.addEventListener('change', () => {
    base = custom.value
    pick(formatColor(base, alpha))
  })
  const range = el('input')
  range.type = 'range'
  range.min = '0'
  range.max = '100'
  range.value = String(Math.round(alpha * 100))
  range.setAttribute('aria-label', 'Opacity')
  const pct = el('span', 'lf-color-pct', `${range.value}%`)
  range.addEventListener('input', () => (pct.textContent = `${range.value}%`))
  range.addEventListener('change', () => {
    alpha = Number(range.value) / 100
    pick(formatColor(base, alpha))
  })
  row.append(custom, range, pct)

  const out: HTMLElement[] = [grid, row]
  if (opts.none) {
    out.push(
      menuItem({ label: 'None' }, () => {
        opts.none!()
        opts.close()
      }),
    )
  }
  return out
}

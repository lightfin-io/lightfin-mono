import { el } from './dom'

export interface PopoverOptions {
  /** Where it opens from the anchor. Default below. */
  side?: 'below' | 'right'
  /** ARIA role; `menu` (default) for lists of commands. */
  role?: 'menu' | 'dialog'
  label?: string
  className?: string
  /** Selector for the first focused control, if present. */
  initialFocus?: string
}

export interface Popover {
  open(): void
  close(): void
  toggle(): void
  readonly isOpen: boolean
}

/**
 * A popup panel anchored to a button, mounted in `host` (the chrome host,
 * outside the chart, so presses in it never reach the chart). The anchor
 * toggles it; a press outside or Escape closes it, Escape returning focus to
 * the anchor. `build` fills it each time it opens and gets `close`.
 */
export function popover(
  anchor: HTMLElement,
  host: HTMLElement,
  build: (close: () => void) => Node[],
  opts: PopoverOptions = {},
): Popover {
  const role = opts.role ?? 'menu'
  let panel: HTMLElement | null = null
  anchor.setAttribute('aria-haspopup', role === 'menu' ? 'menu' : 'dialog')
  anchor.setAttribute('aria-expanded', 'false')

  const onOutside = (e: PointerEvent) => {
    const t = e.target as Node
    if (!panel?.contains(t) && !anchor.contains(t)) close()
  }
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return
    e.preventDefault()
    e.stopPropagation()
    close()
    anchor.focus()
  }

  function close(): void {
    if (!panel) return
    panel.remove()
    panel = null
    anchor.setAttribute('aria-expanded', 'false')
    document.removeEventListener('pointerdown', onOutside, true)
    document.removeEventListener('keydown', onKey, true)
  }

  function open(): void {
    if (panel) return
    panel = el('div', `lf-menu ${opts.className ?? ''}`)
    panel.setAttribute('role', role)
    if (opts.label) panel.setAttribute('aria-label', opts.label)
    panel.append(...build(close))
    host.append(panel)
    place(panel, anchor, host, opts.side ?? 'below')
    anchor.setAttribute('aria-expanded', 'true')
    const firstControl = panel.querySelector<HTMLElement>(
      'button, input, select',
    )
    const target = opts.initialFocus
      ? (panel.querySelector<HTMLElement>(opts.initialFocus) ?? firstControl)
      : firstControl
    target?.focus()
    document.addEventListener('pointerdown', onOutside, true)
    document.addEventListener('keydown', onKey, true)
  }

  return {
    open,
    close,
    toggle: () => (panel ? close() : open()),
    get isOpen() {
      return panel !== null
    },
  }
}

/** Position `panel` beside `anchor`, kept inside `host`. */
function place(
  panel: HTMLElement,
  anchor: HTMLElement,
  host: HTMLElement,
  side: 'below' | 'right',
): void {
  const h = host.getBoundingClientRect()
  const a = anchor.getBoundingClientRect()
  let left = side === 'right' ? a.right + 4 : a.left
  let top = side === 'right' ? a.top : a.bottom + 4
  left = Math.max(h.left, Math.min(left, h.right - panel.offsetWidth - 4))
  top = Math.max(h.top, Math.min(top, h.bottom - panel.offsetHeight - 4))
  panel.style.left = `${left - h.left}px`
  panel.style.top = `${top - h.top}px`
}

import type {
  AnnotationPatch,
  AnnotationStyle,
  AnnotationType,
  Annotations,
  LineEnds,
  LineStyle,
} from '../annotations'
import type { Chart } from '../chart/chart'
import { colorPicker } from './colorPicker'
import type { IconName } from './dom'
import { ICONS, button, el, menuItem } from './dom'
import type { ToolStyles } from './drawingTools'
import { openDrawingSettingsModal } from './modals'
import type { Popover } from './popover'
import { popover } from './popover'

/** Which style controls a drawing type gets. */
interface Controls {
  /** The main color swatch's label. */
  color: string
  /** The main color is the text color (no separate text color swatch). */
  colorIsText?: true
  widths?: readonly number[]
  lineStyle?: true
  /** The fill swatch's label. */
  fill?: string
  /** Font controls: always, or once the drawing has a caption. */
  font?: 'always' | 'caption'
  /** Line-end controls: extension and arrowheads, or extension only. */
  ends?: 'line' | 'extend'
  /** An edit-text button. */
  text?: true
}

const WIDTHS = [1, 2, 3, 4]
const LINE: Controls = {
  color: 'Line color',
  widths: WIDTHS,
  lineStyle: true,
  font: 'caption',
  text: true,
}
const SHAPE: Controls = { ...LINE, fill: 'Fill color' }
const LABELLED_LINE: Controls = { ...LINE, font: 'always' }
const POSITION: Controls = {
  color: 'Line color',
  lineStyle: true,
  font: 'always',
}

const CONTROLS: Record<AnnotationType, Controls> = {
  trendline: { ...LINE, ends: 'line' },
  hline: LINE,
  vline: LINE,
  hray: LINE,
  crossline: LINE,
  channel: { ...SHAPE, ends: 'extend' },
  pitchfork: SHAPE,
  regression: SHAPE,
  fib: LABELLED_LINE,
  fibExtension: LABELLED_LINE,
  gannFan: LABELLED_LINE,
  elliottImpulse: LABELLED_LINE,
  elliottCorrection: LABELLED_LINE,
  headAndShoulders: LABELLED_LINE,
  rectangle: SHAPE,
  ellipse: SHAPE,
  triangle: SHAPE,
  brush: { color: 'Color', widths: [1, 2, 4, 8, 12, 16], lineStyle: true },
  text: {
    color: 'Text color',
    colorIsText: true,
    fill: 'Background',
    font: 'always',
    text: true,
  },
  callout: { color: 'Color', font: 'always', text: true },
  priceLabel: { color: 'Color', font: 'always', text: true },
  marker: { color: 'Color', font: 'caption', text: true },
  longPosition: POSITION,
  shortPosition: POSITION,
  measure: { color: 'Color', font: 'always' },
}

const FONT_SIZES = [10, 11, 12, 14, 16, 20, 24, 28, 32, 40]
const FONTS: { label: string; family?: string }[] = [
  { label: 'Default' },
  { label: 'Sans-serif', family: 'Helvetica, Arial, sans-serif' },
  { label: 'Serif', family: 'Georgia, "Times New Roman", serif' },
  { label: 'Monospace', family: 'ui-monospace, Menlo, Consolas, monospace' },
]
const LINE_STYLES: { style: LineStyle; label: string; dash: string }[] = [
  { style: 'solid', label: 'Solid', dash: '' },
  { style: 'dashed', label: 'Dashed', dash: '4 3' },
  { style: 'dotted', label: 'Dotted', dash: '1 2.5' },
]
// Look, not geometry: what new drawings of a tool start from.
const REMEMBERED: readonly (keyof AnnotationStyle)[] = [
  'color',
  'lineWidth',
  'lineStyle',
  'fillColor',
  'fontSize',
  'fontFamily',
  'bold',
  'italic',
  'textColor',
]

const linePreview = (width: number, dash = '') =>
  `<svg viewBox="0 0 22 18" aria-hidden="true" class="lf-line-preview"><path d="M1 9h20" stroke="currentColor" stroke-width="${width}" stroke-dasharray="${dash}"/></svg>`

const endsOf = (v: LineEnds | undefined) => ({
  start: v === 'start' || v === 'both',
  end: v === 'end' || v === 'both',
})
const toEnds = (start: boolean, end: boolean): LineEnds =>
  start ? (end ? 'both' : 'start') : end ? 'end' : 'none'

const GAP = 8

/**
 * The floating toolbar for the selected drawing: its colors, line width and
 * style, font, line ends, text, lock, clone/order, and delete — the controls
 * its type supports. Sits at the plot's top-right until dragged by its grip.
 * Style picks also become the tool's style for new drawings (`styles`).
 */
export function createDrawingToolbar(
  chart: Chart,
  annotations: Annotations,
  host: HTMLElement,
  styles: ToolStyles,
): { dispose(): void } {
  const bar = el('div', 'lf-toolbar lf-drawing-toolbar')
  bar.setAttribute('role', 'toolbar')
  bar.setAttribute('aria-label', 'Drawing style')
  bar.hidden = true
  // The chart pans (and deselects) on a press, and would swallow these clicks.
  bar.addEventListener('pointerdown', e => e.stopPropagation())
  bar.addEventListener('dblclick', e => e.stopPropagation())
  chart.element.append(bar)

  let layout = ''
  let syncers: (() => void)[] = []
  let popovers: Popover[] = []
  let closeSettings: (() => void) | undefined
  // Where the user dragged it, relative to the chart element.
  let placed: { x: number; y: number } | null = null

  const id = () => annotations.selected
  const current = () => {
    const sel = id()
    return sel ? annotations.get(sel) : null
  }
  const style = () => annotations.effectiveStyle(id() ?? '') ?? {}

  const apply = (patch: AnnotationPatch) => {
    const ann = current()
    if (!ann) return
    annotations.update(ann.id, patch)
    if (patch.style) remember(ann.type, patch.style)
  }
  const setStyle = (s: AnnotationStyle) => apply({ style: s })

  function remember(type: AnnotationType, s: AnnotationStyle): void {
    const next = { ...styles.get(type) }
    for (const key of REMEMBERED) {
      if (!(key in s)) continue
      if (s[key] === undefined) delete next[key]
      else (next as Record<string, unknown>)[key] = s[key]
    }
    styles.set(type, next)
  }

  /** A toolbar button opening a popover built fresh on each open. */
  function withPopover(
    b: HTMLButtonElement,
    build: (close: () => void) => Node[],
    label: string,
    role: 'menu' | 'dialog' = 'menu',
  ): HTMLButtonElement {
    const p = popover(b, host, build, { label, role })
    b.addEventListener('click', () => p.toggle())
    popovers.push(p)
    return b
  }

  function colorButton(
    label: string,
    icon: IconName,
    get: (s: AnnotationStyle) => string | undefined,
    set: (color: string | undefined) => void,
    none = false,
  ): HTMLButtonElement {
    const b = button({ icon, title: label }, () => {})
    b.classList.add('lf-swatch-btn')
    const swatch = el('span', 'lf-swatch')
    b.append(swatch)
    syncers.push(() => {
      swatch.style.setProperty('--lf-swatch-color', get(style()) ?? '')
    })
    return withPopover(
      b,
      close =>
        colorPicker(get(style()), set, {
          close,
          none: none ? () => set(undefined) : undefined,
        }),
      label,
      'dialog',
    )
  }

  /** A menu of exclusive choices; the toolbar button shows the current one. */
  function choiceButton<T>(
    label: string,
    options: readonly T[],
    get: () => T,
    set: (v: T) => void,
    render: (v: T) => { html?: string; text: string },
    showText = false,
  ): HTMLButtonElement {
    const b = button({ title: label }, () => {})
    syncers.push(() => {
      const r = render(get())
      if (r.html) {
        b.innerHTML = r.html
        if (showText) b.append(el('span', 'lf-btn-sub', r.text))
      } else b.textContent = r.text
      b.classList.toggle('lf-btn-text', !r.html)
    })
    return withPopover(
      b,
      close =>
        options.map(v => {
          const r = render(v)
          const it = menuItem({ label: r.text }, () => {
            set(v)
            close()
          })
          if (r.html) it.insertAdjacentHTML('afterbegin', r.html)
          it.setAttribute('role', 'menuitemradio')
          it.setAttribute('aria-checked', String(v === get()))
          return it
        }),
      label,
    )
  }

  function toggleButton(
    text: string,
    label: string,
    key: 'bold' | 'italic',
  ): HTMLButtonElement {
    const b = button({ label: text, title: label }, () =>
      setStyle({ [key]: !style()[key] }),
    )
    b.classList.add('lf-btn-text', `lf-${key}`)
    syncers.push(() => b.setAttribute('aria-pressed', String(!!style()[key])))
    return b
  }

  function fontButton(): HTMLButtonElement {
    const b = button({ title: 'Font' }, () => {})
    b.classList.add('lf-btn-text')
    syncers.push(() => (b.textContent = String(style().fontSize)))
    return withPopover(
      b,
      close => {
        const s = style()
        const ann = current()
        const family = ann?.style.fontFamily
        const families = FONTS.map(f => {
          const it = menuItem({ label: f.label }, () => {
            setStyle({ fontFamily: f.family })
            close()
          })
          it.setAttribute('role', 'menuitemradio')
          it.setAttribute('aria-checked', String(f.family === family))
          if (f.family) {
            it.classList.add('lf-font-preview')
            it.style.setProperty('--lf-preview-font', f.family)
          }
          return it
        })
        const sizes = el('div', 'lf-sizes')
        for (const size of FONT_SIZES) {
          const it = menuItem({ label: String(size) }, () => {
            setStyle({ fontSize: size })
            close()
          })
          it.setAttribute('role', 'menuitemradio')
          it.setAttribute('aria-checked', String(size === s.fontSize))
          sizes.append(it)
        }
        return [
          el('div', 'lf-menu-label', 'Font'),
          ...families,
          el('div', 'lf-menu-label', 'Size'),
          sizes,
        ]
      },
      'Font',
    )
  }

  function endsButton(kind: 'line' | 'extend'): HTMLButtonElement {
    const b = button({ icon: 'lineEnds', title: 'Line ends' }, () => {})
    return withPopover(
      b,
      () => {
        const rows: [string, 'extend' | 'arrow', 'start' | 'end'][] = [
          ['Extend past start', 'extend', 'start'],
          ['Extend past end', 'extend', 'end'],
        ]
        if (kind === 'line') {
          rows.push(
            ['Arrow at start', 'arrow', 'start'],
            ['Arrow at end', 'arrow', 'end'],
          )
        }
        return rows.map(([label, key, end]) => {
          const it = menuItem({ label, role: 'menuitemcheckbox' }, () => {
            const ends = endsOf(style()[key])
            ends[end] = !ends[end]
            setStyle({ [key]: toEnds(ends.start, ends.end) })
            check()
          })
          const check = () =>
            it.setAttribute('aria-checked', String(endsOf(style()[key])[end]))
          check()
          return it
        })
      },
      'Line ends',
    )
  }

  function rebuild(): void {
    for (const p of popovers) p.close()
    popovers = []
    syncers = []
    bar.replaceChildren()
    const ann = current()
    if (!ann) return
    const c = CONTROLS[ann.type]
    const editsText = ann.type === 'text' || ann.type === 'callout'

    const grip = el('div', 'lf-grip')
    grip.innerHTML = ICONS.grip
    grip.title = 'Move toolbar'
    grip.addEventListener('pointerdown', startDrag)
    bar.append(grip)

    bar.append(
      colorButton(
        c.color,
        c.colorIsText ? 'textColor' : 'lineColor',
        s => s.color,
        color => setStyle({ color }),
      ),
    )
    if (c.widths) {
      bar.append(
        choiceButton(
          'Line width',
          c.widths,
          () => style().lineWidth ?? 1,
          lineWidth => setStyle({ lineWidth }),
          w => ({ html: linePreview(Math.min(w, 8)), text: `${w}px` }),
          true,
        ),
      )
    }
    if (c.lineStyle) {
      bar.append(
        choiceButton(
          'Line style',
          LINE_STYLES.map(l => l.style),
          () => style().lineStyle ?? 'solid',
          lineStyle => setStyle({ lineStyle }),
          v => {
            const l = LINE_STYLES.find(x => x.style === v)!
            return { html: linePreview(2, l.dash), text: l.label }
          },
        ),
      )
    }
    if (c.fill) {
      bar.append(
        colorButton(
          c.fill,
          'fill',
          s => s.fillColor,
          fillColor => setStyle({ fillColor }),
          !!c.colorIsText,
        ),
      )
    }
    if (c.font === 'always' || (c.font && ann.text)) {
      if (!c.colorIsText) {
        bar.append(
          colorButton(
            'Text color',
            'textColor',
            s => s.textColor,
            textColor => setStyle({ textColor }),
          ),
        )
      }
      bar.append(
        fontButton(),
        toggleButton('B', 'Bold', 'bold'),
        toggleButton('I', 'Italic', 'italic'),
      )
    }
    if (c.text) {
      const title = editsText
        ? 'Edit text'
        : ann.text
          ? 'Edit caption'
          : 'Add caption'
      bar.append(
        button({ icon: 'text', title }, () => {
          const sel = id()
          if (sel) annotations.editText(sel)
        }),
      )
    }
    if (c.ends) bar.append(endsButton(c.ends))

    bar.append(el('div', 'lf-sep'))
    const settings = button(
      { icon: 'settings', title: 'Drawing settings' },
      () => {
        const sel = id()
        if (!sel || closeSettings) return
        closeSettings = openDrawingSettingsModal(host, annotations, sel, () => {
          closeSettings = undefined
        })
      },
    )
    settings.setAttribute('aria-haspopup', 'dialog')
    const lock = button({ icon: 'unlock', title: 'Lock' }, () =>
      apply({ locked: !current()?.locked }),
    )
    syncers.push(() => {
      const locked = !!current()?.locked
      lock.innerHTML = ICONS[locked ? 'lock' : 'unlock']
      lock.title = locked ? 'Unlock' : 'Lock'
      lock.setAttribute('aria-label', lock.title)
      lock.setAttribute('aria-pressed', String(locked))
    })
    const more = withPopover(
      button({ icon: 'more', title: 'More' }, () => {}),
      close => {
        const run = (fn: (id: string) => void) => () => {
          close()
          const sel = id()
          if (sel) fn(sel)
        }
        return [
          menuItem(
            { label: 'Clone', icon: 'clone' },
            run(sel => annotations.clone(sel)),
          ),
          menuItem(
            { label: 'Bring to front' },
            run(sel => annotations.bringToFront(sel)),
          ),
          menuItem(
            { label: 'Send to back' },
            run(sel => annotations.sendToBack(sel)),
          ),
        ]
      },
      'More',
    )
    const remove = button({ icon: 'trash', title: 'Delete' }, () => {
      const sel = id()
      if (!sel) return
      annotations.remove(sel)
      chart.element.focus({ preventScroll: true })
    })
    bar.append(settings, lock, more, remove)
  }

  function position(): void {
    if (bar.hidden) return
    const root = chart.element
    const main = chart.paneLayout().main
    const w = bar.offsetWidth
    const h = bar.offsetHeight
    const at = placed ?? {
      x: main.left + main.width - w - GAP,
      y: main.top + GAP,
    }
    const x = Math.max(0, Math.min(at.x, root.clientWidth - w))
    const y = Math.max(0, Math.min(at.y, root.clientHeight - h))
    bar.style.left = `${x}px`
    bar.style.top = `${y}px`
  }

  function startDrag(e: PointerEvent): void {
    const grip = e.currentTarget as HTMLElement
    e.preventDefault()
    grip.setPointerCapture(e.pointerId)
    const start = { x: e.clientX, y: e.clientY }
    const from = { x: bar.offsetLeft, y: bar.offsetTop }
    const move = (m: PointerEvent) => {
      placed = {
        x: from.x + m.clientX - start.x,
        y: from.y + m.clientY - start.y,
      }
      position()
    }
    const up = () => {
      grip.removeEventListener('pointermove', move)
      grip.removeEventListener('pointerup', up)
      grip.removeEventListener('pointercancel', up)
    }
    grip.addEventListener('pointermove', move)
    grip.addEventListener('pointerup', up)
    grip.addEventListener('pointercancel', up)
  }

  /** Show, rebuild, or just refresh the toolbar for the current selection. */
  function sync(): void {
    const ann = current()
    if (!ann) {
      layout = ''
      for (const p of popovers) p.close()
      bar.hidden = true
      return
    }
    const next = `${ann.id} ${ann.type} ${!!ann.text}`
    if (next !== layout) {
      layout = next
      rebuild()
    }
    for (const s of syncers) s()
    bar.hidden = false
    position()
  }

  const offs = [
    annotations.on('selectionChange', () => {
      closeSettings?.()
      sync()
    }),
    annotations.on('change', sync),
    chart.on('layoutChange', position),
  ]
  sync()

  return {
    dispose: () => {
      for (const off of offs) off()
      closeSettings?.()
      for (const p of popovers) p.close()
      bar.remove()
    },
  }
}

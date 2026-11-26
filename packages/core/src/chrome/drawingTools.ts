import type {
  AnnotationStyle,
  AnnotationType,
  Annotations,
  ToolPreset,
} from '../annotations'
import type { Chart } from '../chart/chart'
import type { IconName } from './dom'
import { ICONS, button, el, menuItem } from './dom'
import { popover } from './popover'
import type { Toolbar } from './toolbars'

/** One entry in the drawing tools: a tool, optionally armed with a preset. */
interface ToolItem<Id extends IconName = IconName> {
  tool: AnnotationType
  icon: Id
  title: string
  preset?: ToolPreset
}

/**
 * The style the user last picked for each tool in the drawing toolbar, which
 * new drawings of that tool start from.
 */
export type ToolStyles = Map<AnnotationType, AnnotationStyle>

const item = <Id extends IconName>(
  tool: AnnotationType,
  icon: Id,
  title: string,
  preset?: ToolPreset,
): ToolItem<Id> => ({ tool, icon, title, preset })

/** The left toolbar's tool groups, each a button for its last-used tool and a flyout of the rest. */
const TOOL_GROUPS = [
  {
    label: 'Lines',
    items: [
      item('trendline', 'trendline', 'Trend line'),
      item('trendline', 'ray', 'Ray', { style: { extend: 'end' } }),
      item('trendline', 'extendedLine', 'Extended line', {
        style: { extend: 'both' },
      }),
      item('trendline', 'arrow', 'Arrow', { style: { arrow: 'end' } }),
      item('hline', 'hline', 'Horizontal line'),
      item('hray', 'hray', 'Horizontal ray'),
      item('vline', 'vline', 'Vertical line'),
      item('crossline', 'crossline', 'Cross line'),
    ],
  },
  {
    label: 'Channels',
    items: [
      item('channel', 'channel', 'Parallel channel'),
      item('regression', 'regression', 'Regression trend'),
      item('pitchfork', 'pitchfork', 'Pitchfork'),
    ],
  },
  {
    label: 'Fibonacci and Gann',
    items: [
      item('fib', 'fib', 'Fib retracement'),
      item('fibExtension', 'fibExtension', 'Trend-based fib extension'),
      item('gannFan', 'gannFan', 'Gann Fan'),
    ],
  },
  {
    label: 'Patterns',
    items: [
      item('elliottImpulse', 'elliottImpulse', 'Elliott Impulse'),
      item('elliottCorrection', 'elliottCorrection', 'Elliott Correction'),
      item('headAndShoulders', 'headAndShoulders', 'Head and Shoulders'),
    ],
  },
  {
    label: 'Shapes',
    items: [
      item('rectangle', 'rectangle', 'Rectangle'),
      item('ellipse', 'ellipse', 'Ellipse'),
      item('triangle', 'triangle', 'Triangle'),
      item('brush', 'brush', 'Brush'),
      item('brush', 'highlighter', 'Highlighter', {
        style: { color: '#ffeb3b66', lineWidth: 12 },
      }),
    ],
  },
  {
    label: 'Labels',
    items: [
      item('text', 'text', 'Text'),
      item('callout', 'callout', 'Callout'),
      item('priceLabel', 'priceLabel', 'Price label'),
      item('marker', 'arrowUpMark', 'Arrow mark up', { shape: 'arrowUp' }),
      item('marker', 'arrowDownMark', 'Arrow mark down', {
        shape: 'arrowDown',
      }),
      item('marker', 'flag', 'Flag', { shape: 'flag' }),
    ],
  },
  {
    label: 'Measure',
    items: [
      item('longPosition', 'longPosition', 'Long position'),
      item('shortPosition', 'shortPosition', 'Short position'),
      item('measure', 'measure', 'Date and price range'),
    ],
  },
]

/** Drawing toolbar item IDs, including presets such as `ray` and `highlighter`. */
export type DrawingToolId =
  (typeof TOOL_GROUPS)[number]['items'][number]['icon']

/** Zero or more modifiers followed by one key. `Option` is an alias for `Alt`. */
export type DrawingToolHotkey = readonly [
  ...modifiers: (keyof typeof MODIFIERS | 'Option')[],
  key: string,
]

/** Per-tool overrides such as `{ trendline: ['L'], hline: null }`. */
export type DrawingToolHotkeys = Partial<
  Record<DrawingToolId, DrawingToolHotkey | null>
>

/** TradingView's drawing shortcuts for the matching tools. Alt is Option on macOS. */
export const DEFAULT_DRAWING_TOOL_HOTKEYS: Readonly<DrawingToolHotkeys> = {
  trendline: ['Alt', 'T'],
  hline: ['Alt', 'H'],
  hray: ['Alt', 'J'],
  vline: ['Alt', 'V'],
  crossline: ['Alt', 'C'],
  fib: ['Alt', 'F'],
  rectangle: ['Alt', 'Shift', 'R'],
}

const MODIFIERS = {
  Control: 'ctrlKey',
  Alt: 'altKey',
  Shift: 'shiftKey',
  Meta: 'metaKey',
} as const
const MODIFIER_NAMES = Object.keys(MODIFIERS) as (keyof typeof MODIFIERS)[]

function keyName(key: string): string {
  if (key === ' ') return 'Space'
  if (key === '+') return 'Plus'
  return key.length === 1 ? key.toUpperCase() : key
}

function resolveHotkeys(overrides: DrawingToolHotkeys | false) {
  const bindings = new Map<string, ToolItem>()
  if (overrides === false) return bindings
  for (const { items } of TOOL_GROUPS) {
    for (const it of items) {
      const override = overrides[it.icon]
      const value =
        override === undefined
          ? DEFAULT_DRAWING_TOOL_HOTKEYS[it.icon]
          : override
      if (!Array.isArray(value)) continue
      const requestedModifiers = value.map(key =>
        key === 'Option' ? 'Alt' : key,
      )
      const key = requestedModifiers.pop()
      if (
        typeof key !== 'string' ||
        !/^(?:\S|[A-Z][A-Za-z0-9]+)$/u.test(key) ||
        Object.hasOwn(MODIFIERS, key)
      )
        continue
      const modifiers = MODIFIER_NAMES.filter(name =>
        requestedModifiers.includes(name),
      )
      if (modifiers.length !== requestedModifiers.length) continue
      const binding = [...modifiers, keyName(key)].join('+')
      if (override !== undefined || !bindings.has(binding))
        bindings.set(binding, it)
    }
  }
  return bindings
}

const CHEVRON =
  '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M10.5 5.5v5h-5z" fill="currentColor"/></svg>'

/**
 * Left toolbar: the cursor, the drawing tools in groups (each
 * button arms its group's last-used tool; the corner arrow opens the
 * group), then the magnet, stay-in-drawing-mode, lock-all, and hide-all
 * toggles, undo/redo, and "remove all drawings". Picking the armed tool again disarms
 * it.
 */
export function createLeftToolbar(
  chart: Chart,
  annotations: Annotations,
  host: HTMLElement,
  styles: ToolStyles,
  hotkeys: DrawingToolHotkeys | false = {},
): Toolbar {
  const bar = el('div', 'lf-toolbar lf-toolbar-left')
  bar.setAttribute('role', 'toolbar')
  bar.setAttribute('aria-label', 'Drawing tools')
  bar.setAttribute('aria-orientation', 'vertical')

  const bindings = resolveHotkeys(hotkeys)
  const shortcuts = new Map([...bindings].map(([key, it]) => [it, key]))
  const labelFor = (it: ToolItem) => {
    const shortcut = shortcuts.get(it)
    return shortcut
      ? `${it.title} (${shortcut.replace(/^Control\+/, 'Ctrl+')})`
      : it.title
  }
  const describeShortcut = (b: HTMLButtonElement, it: ToolItem) => {
    const shortcut = shortcuts.get(it)
    if (shortcut) b.setAttribute('aria-keyshortcuts', shortcut)
    else b.removeAttribute('aria-keyshortcuts')
  }

  let armed: ToolItem | null = null
  const arm = (next: ToolItem | null) => {
    armed = next
    if (!next) {
      annotations.setTool(null)
      return
    }
    annotations.setTool(next.tool, {
      shape: next.preset?.shape,
      style: { ...styles.get(next.tool), ...next.preset?.style },
    })
  }

  const cursor = button({ icon: 'cursor', title: 'Cursor' }, () => arm(null))

  const groups = TOOL_GROUPS.map(({ label, items: groupItems }) => {
    const items: ToolItem[] = groupItems
    const wrap = el('div', 'lf-tool-group')
    let current = items[0]!
    const main = button({ icon: current.icon, title: labelFor(current) }, () =>
      arm(armed === current ? null : current),
    )
    describeShortcut(main, current)
    const show = (it: ToolItem) => {
      current = it
      main.innerHTML = ICONS[it.icon]
      main.title = labelFor(it)
      main.setAttribute('aria-label', main.title)
      describeShortcut(main, it)
    }
    const choose = (it: ToolItem) => {
      show(it)
      arm(it)
    }
    const more = button({ title: `More ${label.toLowerCase()}` }, () =>
      flyout.toggle(),
    )
    more.className = 'lf-btn lf-tool-more'
    more.innerHTML = CHEVRON
    const flyout = popover(
      more,
      host,
      close =>
        items.map(it => {
          const b = menuItem({ label: labelFor(it), icon: it.icon }, () => {
            close()
            choose(it)
          })
          describeShortcut(b, it)
          b.setAttribute('aria-pressed', String(it === armed))
          return b
        }),
      { side: 'right', label },
    )
    // Right-click opens the group too.
    main.addEventListener('contextmenu', e => {
      e.preventDefault()
      flyout.open()
    })
    wrap.append(main, more)
    return { items, wrap, main, show, choose, flyout }
  })

  const root = chart.element
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.target !== root || e.defaultPrevented || e.isComposing) return
    const modifiers = MODIFIER_NAMES.filter(name => e[MODIFIERS[name]])
    const lookup = (key: string) => bindings.get([...modifiers, key].join('+'))
    let it = lookup(keyName(e.key))
    // Option and Shift can turn a letter or digit into a different character.
    if (!it && (e.altKey || e.shiftKey) && !/^[a-z0-9]$/i.test(e.key)) {
      const physicalKey = /^(?:Key|Digit)([A-Z0-9])$/.exec(e.code)?.[1]
      if (physicalKey) it = lookup(physicalKey)
    }
    if (!it) return
    e.preventDefault()
    if (!e.repeat && it !== armed)
      groups.find(g => g.items.includes(it))?.choose(it)
  }
  if (bindings.size) root.addEventListener('keydown', onKeyDown)

  const toggles: { b: HTMLButtonElement; on(): boolean }[] = []
  const toggle = (
    icon: IconName,
    title: string,
    on: () => boolean,
    set: (on: boolean) => void,
  ) => {
    const b = button({ icon, title }, () => {
      set(!on())
      sync()
    })
    toggles.push({ b, on })
    return b
  }

  const undo = button({ icon: 'undo', title: 'Undo' }, () => annotations.undo())
  const redo = button({ icon: 'redo', title: 'Redo' }, () => annotations.redo())

  bar.append(
    cursor,
    ...groups.map(g => g.wrap),
    el('div', 'lf-sep'),
    toggle(
      'magnet',
      'Magnet',
      () => chart.crosshairMode() === 'magnet',
      on => chart.setCrosshairMode(on ? 'magnet' : 'normal'),
    ),
    toggle(
      'stayDrawing',
      'Stay in drawing mode',
      () => annotations.stickyTool,
      on => annotations.setStickyTool(on),
    ),
    toggle(
      'lock',
      'Lock all drawings',
      () => annotations.locked,
      on => annotations.setLocked(on),
    ),
    toggle(
      'eyeOff',
      'Hide all drawings',
      () => !annotations.visible,
      on => annotations.setVisible(!on),
    ),
    el('div', 'lf-sep'),
    undo,
    redo,
    button({ icon: 'trash', title: 'Remove all drawings' }, () =>
      annotations.clear(),
    ),
  )
  const sync = () => {
    cursor.setAttribute('aria-pressed', String(!annotations.tool))
    for (const g of groups) {
      const pressed = !!armed && g.items.includes(armed)
      g.main.setAttribute('aria-pressed', String(pressed))
    }
    for (const t of toggles) t.b.setAttribute('aria-pressed', String(t.on()))
    undo.disabled = !annotations.canUndo
    redo.disabled = !annotations.canRedo
  }
  const offChange = annotations.on('change', sync)
  const offCrosshair = chart.on('crosshairModeChange', sync)
  // load() resets history and clears selection without emitting change.
  const offSelection = annotations.on('selectionChange', sync)
  const offTool = annotations.on('toolChange', tool => {
    if (!tool) armed = null
    else if (armed?.tool !== tool) {
      // Armed from outside the toolbar: show the first item for it.
      const group = groups.find(g => g.items.some(it => it.tool === tool))
      armed = group?.items.find(it => it.tool === tool) ?? null
      if (group && armed) group.show(armed)
    }
    sync()
  })
  // Application code can change drawing toggles outside the toolbar.
  bar.addEventListener('pointerenter', sync)
  sync()

  return {
    el: bar,
    sync,
    dispose: () => {
      root.removeEventListener('keydown', onKeyDown)
      offTool()
      offChange()
      offCrosshair()
      offSelection()
      for (const g of groups) g.flyout.close()
      bar.remove()
    },
  }
}

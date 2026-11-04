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
export interface ToolItem {
  tool: AnnotationType
  icon: IconName
  title: string
  preset?: ToolPreset
}

/**
 * The style the user last picked for each tool in the drawing toolbar, which
 * new drawings of that tool start from.
 */
export type ToolStyles = Map<AnnotationType, AnnotationStyle>

const item = (
  tool: AnnotationType,
  icon: IconName,
  title: string,
  preset?: ToolPreset,
): ToolItem => ({ tool, icon, title, preset })

/** The left toolbar's tool groups, each a button for its last-used tool and a flyout of the rest. */
export const TOOL_GROUPS: { label: string; items: ToolItem[] }[] = [
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
    label: 'Fibonacci',
    items: [
      item('fib', 'fib', 'Fib retracement'),
      item('fibExtension', 'fibExtension', 'Trend-based fib extension'),
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

const CHEVRON =
  '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M10.5 5.5v5h-5z" fill="currentColor"/></svg>'

/**
 * Left toolbar (PLAN §9): the cursor, the drawing tools in groups (each
 * button arms its group's last-used tool; the corner arrow opens the
 * group), then the magnet, stay-in-drawing-mode, lock-all, and hide-all
 * toggles, and "remove all drawings". Picking the armed tool again disarms
 * it.
 */
export function createLeftToolbar(
  chart: Chart,
  annotations: Annotations,
  host: HTMLElement,
  styles: ToolStyles,
): Toolbar {
  const bar = el('div', 'lf-toolbar lf-toolbar-left')
  bar.setAttribute('role', 'toolbar')
  bar.setAttribute('aria-label', 'Drawing tools')
  bar.setAttribute('aria-orientation', 'vertical')

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

  const groups = TOOL_GROUPS.map(({ label, items }) => {
    const wrap = el('div', 'lf-tool-group')
    let current = items[0]!
    const main = button({ icon: current.icon, title: current.title }, () =>
      arm(armed === current ? null : current),
    )
    const show = (it: ToolItem) => {
      current = it
      main.innerHTML = ICONS[it.icon]
      main.title = it.title
      main.setAttribute('aria-label', it.title)
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
          const b = menuItem({ label: it.title, icon: it.icon }, () => {
            close()
            show(it)
            arm(it)
          })
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
    return { items, wrap, main, show, flyout }
  })

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
  }
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
  // The magnet can be toggled elsewhere (e.g. a key), with no event.
  bar.addEventListener('pointerenter', sync)
  sync()

  return {
    el: bar,
    sync,
    dispose: () => {
      offTool()
      for (const g of groups) g.flyout.close()
      bar.remove()
    },
  }
}

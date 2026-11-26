import type { Chart, PlotRect } from '../chart/chart'
import type { IndicatorHandle } from '../indicators/types'
import { button, el } from './dom'
import { formatChange, formatClock, formatVolume } from './format'
import { openIndicatorSettings } from './modals'

interface IndicatorRow {
  handle: IndicatorHandle
  element: HTMLElement
  values: HTMLSpanElement[]
  actions: HTMLButtonElement[]
}

export interface HudContext {
  /** Where modals mount (the chrome host). */
  host: HTMLElement
  /** The active interval label, shown after the instrument name. */
  interval(): string | null
  /** Whether the legend carries the exchange clock (when no bottom toolbar does). */
  showClock: boolean
}

/**
 * Top-left legend: instrument line + OHLCV for the hovered bar (the
 * last bar when not hovering), then one row per indicator with its values and
 * show/hide, settings, and remove controls. Price/volume overlays list under
 * the legend; pane indicators get their row at the top of their own pane.
 * The price pane and each indicator pane show move controls when that pane
 * has a neighbour above or below it. The legend rides on the price pane.
 *
 * DOM structure is rebuilt only when indicators/layout/instrument change;
 * hover and live ticks just rewrite text, coalesced to one update per frame.
 */
export class Hud {
  private readonly chart: Chart
  private readonly ctx: HudContext
  private readonly legend = el('div', 'lf-hud lf-hud-legend')
  private readonly mainPane = el('div', 'lf-hud lf-hud-main')
  private readonly mainActions = el('span', 'lf-hud-actions')
  private mainButtons: HTMLButtonElement[] = []
  private rows: IndicatorRow[] = []
  private readonly title = el('span', 'lf-hud-title')
  private readonly meta = el('span', 'lf-hud-dim')
  private readonly clock = el('span', 'lf-hud-dim')
  private readonly ohlc: Record<'o' | 'h' | 'l' | 'c' | 'chg', HTMLSpanElement>
  private readonly volumeRow = el('div', 'lf-hud-row')
  private readonly volumeValue = el('span')
  private hoverIndex: number | null = null
  private structureDirty = true
  private frame = 0
  private readonly unsubscribers: (() => void)[] = []

  constructor(chart: Chart, ctx: HudContext) {
    this.chart = chart
    this.ctx = ctx

    const head = el('div', 'lf-hud-row')
    head.append(this.title, this.meta, this.clock)
    const values = {} as Record<'o' | 'h' | 'l' | 'c' | 'chg', HTMLSpanElement>
    for (const key of ['o', 'h', 'l', 'c'] as const) {
      const pair = el('span')
      values[key] = el('span')
      pair.append(
        el('span', 'lf-hud-dim', `${key.toUpperCase()} `),
        values[key],
      )
      head.append(pair)
    }
    values.chg = el('span')
    head.append(values.chg)
    this.ohlc = values
    this.volumeRow.append(el('span', 'lf-hud-dim', 'Vol'), this.volumeValue)
    this.legend.append(head)
    // The chart pans on pointerdown and captures the pointer, which would
    // swallow the move buttons' clicks.
    this.mainActions.addEventListener('pointerdown', e => e.stopPropagation())
    this.mainPane.setAttribute('role', 'group')
    this.mainPane.setAttribute('aria-label', 'Chart pane')
    this.mainPane.append(this.legend, this.mainActions)
    chart.element.append(this.mainPane)

    const structural = () => this.schedule(true)
    this.unsubscribers.push(
      chart.on('crosshairMove', e => {
        this.hoverIndex = e?.index ?? null
        this.schedule()
      }),
      chart.on('dataChange', () => this.schedule()),
      chart.on('indicatorsChange', structural),
      chart.on('layoutChange', structural),
      chart.on('seriesChange', structural),
      chart.on('instrumentChange', structural),
    )
    this.render()
  }

  /** Re-render the instrument line (e.g. after an interval change). */
  invalidate(): void {
    this.schedule(true)
  }

  /** Advance the legend clock; called once a second by the chrome. */
  tick(now: Date): void {
    if (!this.ctx.showClock) return
    this.clock.textContent = formatClock(
      now,
      this.chart.instrument()?.timezone,
      this.chart.dateFormatters.timeWithSeconds,
    )
  }

  private schedule(structure = false): void {
    if (structure) this.structureDirty = true
    if (this.frame) return
    this.frame = requestAnimationFrame(() => {
      this.frame = 0
      this.render()
    })
  }

  private render(): void {
    if (this.structureDirty) {
      this.structureDirty = false
      this.rebuild()
    }
    this.update()
  }

  private rebuild(): void {
    const info = this.chart.instrument()
    const interval = this.ctx.interval()
    this.title.textContent = info ? (info.name ?? info.symbol) : ''
    this.meta.textContent = [interval, info?.exchange]
      .filter(Boolean)
      .join(' · ')
    this.clock.hidden = !this.ctx.showClock
    this.tick(new Date())

    // Rows are recreated, so carry focus over to the same control.
    const active = document.activeElement
    let refocus: { handle: IndicatorHandle; action: number } | null = null
    let refocusMain: string | null = null
    if (
      active instanceof HTMLButtonElement &&
      this.mainButtons.includes(active)
    ) {
      refocusMain = active.title
    }
    for (const row of this.rows) {
      const action = row.actions.findIndex(button => button === active)
      if (action !== -1) refocus = { handle: row.handle, action }
      row.element.remove()
    }
    this.rows = []

    const layout = this.chart.paneLayout()
    const opts = this.chart.getOptions()
    const hasVolume = !!this.chart.getSeries()?.store.hasVolumeData
    if (opts.volumeVisible && hasVolume) this.legend.append(this.volumeRow)
    else this.volumeRow.remove()

    for (const handle of this.chart.indicators()) {
      if (handle.placement === 'pane') continue
      this.legend.append(this.buildRow(handle))
    }
    const stack = [
      { handle: null as IndicatorHandle | null, rect: layout.main },
      ...layout.panes.map(pane => ({
        handle: pane.indicator as IndicatorHandle | null,
        rect: pane.rect,
      })),
    ].sort((a, b) => a.rect.top - b.rect.top)
    this.placeMainPane(layout.main, stack)
    for (const slot of stack) {
      if (!slot.handle) continue
      const index = stack.indexOf(slot)
      this.chart.element.append(
        this.buildRow(slot.handle, slot.rect, {
          up: index > 0,
          down: index < stack.length - 1,
        }),
      )
    }

    if (refocus) {
      const row = this.rows.find(r => r.handle === refocus.handle)
      const target = row?.actions[refocus.action] ?? row?.actions[0]
      target?.focus()
    } else if (refocusMain) {
      const match = this.mainButtons.find(
        button => button.title === refocusMain,
      )
      ;(match ?? this.mainButtons[0])?.focus()
    }
  }

  /** Park the legend on the price pane and show move buttons for its neighbours. */
  private placeMainPane(
    rect: PlotRect,
    stack: { handle: IndicatorHandle | null }[],
  ): void {
    this.mainPane.style.top = `${rect.top}px`
    this.mainPane.style.width = `${rect.width}px`
    this.mainPane.style.height = `${rect.height}px`
    const index = stack.findIndex(slot => slot.handle === null)
    const buttons: HTMLButtonElement[] = []
    if (stack.length > 1 && index > 0) {
      buttons.push(
        button({ icon: 'movePaneUp', title: 'Move pane up' }, () =>
          this.chart.movePaneUp(),
        ),
      )
    }
    if (stack.length > 1 && index >= 0 && index < stack.length - 1) {
      buttons.push(
        button({ icon: 'movePaneDown', title: 'Move pane down' }, () =>
          this.chart.movePaneDown(),
        ),
      )
    }
    for (const b of buttons) b.setAttribute('aria-label', `${b.title} chart`)
    this.mainButtons = buttons
    this.mainActions.replaceChildren(...buttons)
    this.mainActions.hidden = buttons.length === 0
  }

  private buildRow(
    handle: IndicatorHandle,
    rect?: PlotRect,
    move?: { up: boolean; down: boolean },
  ): HTMLElement {
    const row = el('div', 'lf-hud-row lf-hud-ind')
    if (!handle.visible) row.dataset.hidden = ''
    const title = [handle.name, ...handle.params].join(' ')
    const label = el('span', 'lf-hud-label', title)
    const values = el('span', 'lf-hud-values')
    const valueEls = handle.plots.map(() => values.appendChild(el('span')))

    const actions = el('span', 'lf-hud-actions')
    // The chart pans on pointerdown and captures the pointer, which would
    // swallow these buttons' clicks.
    actions.addEventListener('pointerdown', e => e.stopPropagation())
    const buttons = [
      button(
        {
          icon: handle.visible ? 'eye' : 'eyeOff',
          title: handle.visible ? 'Hide' : 'Show',
        },
        () => handle.setVisible(!handle.visible),
      ),
      button({ icon: 'settings', title: 'Settings' }, () =>
        openIndicatorSettings(this.ctx.host, handle),
      ),
      button({ icon: 'close', title: 'Remove' }, () => handle.remove()),
    ]
    if (move?.up) {
      buttons.push(
        button({ icon: 'movePaneUp', title: 'Move pane up' }, () =>
          this.chart.movePaneUp(handle),
        ),
      )
    }
    if (move?.down) {
      buttons.push(
        button({ icon: 'movePaneDown', title: 'Move pane down' }, () =>
          this.chart.movePaneDown(handle),
        ),
      )
    }
    for (const b of buttons) {
      b.setAttribute('aria-label', `${b.title} ${title}`)
    }
    actions.append(...buttons)
    row.append(label, values, actions)

    let element = row
    if (rect) {
      element = el('div', 'lf-hud lf-hud-pane')
      element.style.top = `${rect.top}px`
      element.style.width = `${rect.width}px`
      element.style.height = `${rect.height}px`
      element.setAttribute('role', 'group')
      element.setAttribute('aria-label', `${title} pane`)
      element.append(row)
    }
    this.rows.push({ handle, element, values: valueEls, actions: buttons })
    return element
  }

  private update(): void {
    const series = this.chart.getSeries()
    const store = series?.store
    if (!store || store.size === 0) {
      for (const span of Object.values(this.ohlc)) span.textContent = ''
      for (const row of this.rows)
        for (const v of row.values) v.textContent = ''
      return
    }
    const index =
      this.hoverIndex !== null && store.has(this.hoverIndex)
        ? this.hoverIndex
        : store.lastIndex
    const p = store.physical(index)
    const open = store.opens[p]!
    const close = store.closes[p]!
    const prevClose =
      index > store.firstIndex ? store.closes[store.physical(index - 1)]! : open
    const color = close >= open ? 'var(--lf-upColor)' : 'var(--lf-downColor)'
    const fmt = (price: number) => this.chart.formatPrice(price)

    this.ohlc.o.textContent = fmt(open)
    this.ohlc.h.textContent = fmt(store.highs[p]!)
    this.ohlc.l.textContent = fmt(store.lows[p]!)
    this.ohlc.c.textContent = fmt(close)
    this.ohlc.chg.textContent = formatChange(close - prevClose, prevClose, fmt)
    for (const key of ['o', 'h', 'l', 'c'] as const) {
      this.ohlc[key].style.color = color
    }
    this.ohlc.chg.style.color =
      close >= prevClose ? 'var(--lf-upColor)' : 'var(--lf-downColor)'

    this.volumeValue.textContent = formatVolume(store.volumes[p]!)
    this.volumeValue.style.color = color

    for (const { handle, values } of this.rows) {
      handle.plots.forEach((plot, i) => {
        const v = handle.value(plot.key, index)
        const span = values[i]!
        span.textContent = this.formatValue(handle, v)
        span.style.color =
          v < 0 && plot.negativeColor ? plot.negativeColor : plot.color
      })
    }
  }

  private formatValue(handle: IndicatorHandle, v: number): string {
    if (!Number.isFinite(v)) return '—'
    if (handle.placement === 'price') return this.chart.formatPrice(v)
    if (handle.placement === 'volume') return formatVolume(v)
    return v.toFixed(2)
  }

  dispose(): void {
    cancelAnimationFrame(this.frame)
    for (const off of this.unsubscribers) off()
    this.mainPane.remove()
    for (const row of this.rows) row.element.remove()
  }
}

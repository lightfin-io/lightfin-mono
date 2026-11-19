import type { Chart } from '../chart/chart'
import type { IndicatorHandle } from '../indicators/types'
import { button, el } from './dom'
import { fromDateTimeInputs, toDateTimeInputs } from './format'

/**
 * Show a modal over the chrome host. `build` returns the dialog body and gets
 * a `close` callback; Escape and a backdrop click close it too, and focus
 * returns to whatever had it before. Returns `close`.
 */
export function openModal(
  host: HTMLElement,
  title: string,
  build: (close: () => void) => HTMLElement[],
): () => void {
  const previousFocus = document.activeElement as HTMLElement | null
  const backdrop = el('div', 'lf-backdrop')
  const dialog = el('div', 'lf-modal')
  dialog.setAttribute('role', 'dialog')
  dialog.setAttribute('aria-modal', 'true')
  dialog.setAttribute('aria-label', title)

  const close = () => {
    backdrop.remove()
    previousFocus?.focus?.()
  }
  dialog.append(el('h2', '', title), ...build(close))
  backdrop.append(dialog)
  backdrop.addEventListener('pointerdown', e => {
    if (e.target === backdrop) close()
  })
  backdrop.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      close()
    }
  })
  host.append(backdrop)
  ;(
    dialog.querySelector<HTMLElement>('input') ??
    dialog.querySelector<HTMLElement>('button')
  )?.focus()
  return close
}

function field(label: string, input: HTMLElement): HTMLElement {
  const row = el('div', 'lf-field')
  const id = `lf-${Math.random().toString(36).slice(2, 9)}`
  input.id = id
  const lab = el('label', '', label)
  lab.htmlFor = id
  row.append(lab, input)
  return row
}

function input(type: string, value: string): HTMLInputElement {
  const i = el('input', 'lf-input')
  i.type = type
  i.value = value
  return i
}

function actions(
  onCancel: () => void,
  submitLabel: string,
): { row: HTMLElement; submit: HTMLButtonElement } {
  const row = el('div', 'lf-actions')
  const submit = button({ label: submitLabel }, () => {})
  submit.type = 'submit'
  submit.classList.add('lf-btn-primary')
  row.append(button({ label: 'Cancel' }, onCancel), submit)
  return { row, submit }
}

/**
 * "Go to" dialog: jump to a date (centered at the current zoom) or
 * show a custom date range. Dates are entered on the instrument's wall clock.
 */
export function openGoToModal(host: HTMLElement, chart: Chart): void {
  const store = chart.getSeries()?.store
  if (!store || store.size === 0) return
  const tz = chart.instrument()?.timezone
  const firstTime = store.times[store.physical(store.firstIndex)]!
  const lastTime = store.times[store.physical(store.lastIndex)]!
  const last = toDateTimeInputs(lastTime, tz)
  const first = toDateTimeInputs(firstTime, tz)

  openModal(host, 'Go to', close => {
    const form = el('form')
    const tabs = el('div', 'lf-tabs')
    tabs.setAttribute('role', 'tablist')
    const datePanel = el('div')
    const rangePanel = el('div')

    const dateIn = input('date', last.date)
    const timeIn = input('time', last.time)
    datePanel.append(field('Date', dateIn), field('Time', timeIn))

    const fromIn = input('date', first.date)
    const toIn = input('date', last.date)
    rangePanel.append(field('From', fromIn), field('To', toIn))

    let mode: 'date' | 'range' = 'date'
    const dateTab = button({ label: 'Date' }, () => setMode('date'))
    const rangeTab = button({ label: 'Custom range' }, () => setMode('range'))
    for (const t of [dateTab, rangeTab]) t.setAttribute('role', 'tab')
    tabs.append(dateTab, rangeTab)
    const setMode = (next: 'date' | 'range') => {
      mode = next
      dateTab.setAttribute('aria-selected', String(next === 'date'))
      dateTab.setAttribute('aria-pressed', String(next === 'date'))
      rangeTab.setAttribute('aria-selected', String(next === 'range'))
      rangeTab.setAttribute('aria-pressed', String(next === 'range'))
      datePanel.hidden = next !== 'date'
      rangePanel.hidden = next !== 'range'
      error.textContent = ''
    }

    const error = el('div', 'lf-error')
    error.setAttribute('role', 'alert')
    const { row } = actions(close, 'Go to')
    form.append(tabs, datePanel, rangePanel, error, row)
    setMode('date')

    form.addEventListener('submit', e => {
      e.preventDefault()
      if (mode === 'date') {
        const t = fromDateTimeInputs(dateIn.value, timeIn.value, tz)
        if (t === null) {
          error.textContent = 'Enter a valid date.'
          return
        }
        void chart.scrollToTime(t)
      } else {
        const from = fromDateTimeInputs(fromIn.value, '00:00', tz)
        const toStart = fromDateTimeInputs(toIn.value, '00:00', tz)
        if (from === null || toStart === null) {
          error.textContent = 'Enter both dates.'
          return
        }
        if (toStart < from) {
          error.textContent = '"From" must be on or before "To".'
          return
        }
        void chart.setVisibleTimeRange({ from, to: toStart + 86_399 })
      }
      close()
    })
    return [form]
  })
}

/** "signalPeriod" → "Signal period". */
function humanize(key: string): string {
  const words = key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

const HEX_COLOR = /^#[0-9a-f]{6}$/i

/**
 * Indicator settings dialog: one input per option, generated from the
 * resolved options — numbers, `#rrggbb` colors (color picker), booleans, and
 * other strings (e.g. `rgba(…)` colors, as text). Applies via `setOptions`.
 */
export function openIndicatorSettings(
  host: HTMLElement,
  handle: IndicatorHandle,
): void {
  const title = [handle.name, ...handle.params].join(' ')
  openModal(host, `${title} settings`, close => {
    const form = el('form')
    const readers: (() => [string, unknown] | null)[] = []

    for (const [key, value] of Object.entries(handle.options)) {
      let control: HTMLInputElement
      if (typeof value === 'number') {
        // Lookback windows must be whole bars.
        const isPeriod = /period/i.test(key)
        control = input('number', String(value))
        control.step = isPeriod ? '1' : 'any'
        if (isPeriod) control.min = '1'
        readers.push(() => {
          const n = control.valueAsNumber
          const ok = isPeriod ? Number.isInteger(n) && n >= 1 : isFinite(n)
          return ok ? [key, n] : null
        })
      } else if (typeof value === 'boolean') {
        control = input('checkbox', '')
        control.checked = value
        readers.push(() => [key, control.checked])
      } else if (typeof value === 'string') {
        control = input(HEX_COLOR.test(value) ? 'color' : 'text', value)
        readers.push(() => [key, control.value])
      } else {
        continue
      }
      form.append(field(humanize(key), control))
    }

    const error = el('div', 'lf-error')
    error.setAttribute('role', 'alert')
    const { row } = actions(close, 'Apply')
    form.append(error, row)
    form.addEventListener('submit', e => {
      e.preventDefault()
      const next: Record<string, unknown> = {}
      for (const read of readers) {
        const entry = read()
        if (!entry) {
          error.textContent =
            'Every number needs a value; periods must be whole numbers ≥ 1.'
          return
        }
        next[entry[0]] = entry[1]
      }
      handle.setOptions(next)
      close()
    })
    return [form]
  })
}

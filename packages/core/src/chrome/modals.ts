import type {
  AnnotationPatch,
  AnnotationPoint,
  Annotations,
} from '../annotations'
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
  onClose?: () => void,
): () => void {
  const previousFocus = document.activeElement as HTMLElement | null
  const backdrop = el('div', 'lf-backdrop')
  const dialog = el('div', 'lf-modal')
  dialog.setAttribute('role', 'dialog')
  dialog.setAttribute('aria-modal', 'true')
  dialog.setAttribute('aria-label', title)

  const close = () => {
    if (!backdrop.parentNode) return
    backdrop.remove()
    onClose?.()
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
    if (e.key === 'Tab') {
      const controls = Array.from(
        dialog.querySelectorAll<HTMLElement>('button, input, select'),
      ).filter(
        node =>
          node.tabIndex >= 0 &&
          !node.matches(':disabled') &&
          node.getClientRects().length > 0,
      )
      const first = controls[0]
      const last = controls.at(-1)
      const edge = e.shiftKey ? first : last
      if (document.activeElement === edge) {
        e.preventDefault()
        ;(e.shiftKey ? last : first)?.focus()
      }
    }
  })
  host.append(backdrop)
  ;(
    dialog.querySelector<HTMLElement>('input, select') ??
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

/** The host writes and restores a drawing backup. Throw or reject to report a failure. */
export interface DrawingPersistence {
  save(): void | Promise<void>
  restore(): void | Promise<void>
}

export function createDrawingBackupButton(
  host: HTMLElement,
  persistence: DrawingPersistence,
): { el: HTMLButtonElement; dispose(): void } {
  let close: (() => void) | undefined
  let busy = false
  const trigger = button({ icon: 'archive', title: 'Drawing backups' }, () => {
    if (close || busy) return
    close = openModal(
      host,
      'Drawing backups',
      dismiss => {
        const note = el(
          'p',
          '',
          'Restoring replaces the current drawings and clears their undo history.',
        )
        const status = el('div')
        status.setAttribute('role', 'status')
        const row = el('div', 'lf-actions')
        const save = button({ label: 'Save backup' }, () => void run('save'))
        const restore = button(
          { label: 'Restore backup' },
          () => void run('restore'),
        )
        row.append(button({ label: 'Close' }, dismiss), save, restore)

        async function run(action: keyof DrawingPersistence): Promise<void> {
          if (busy) return
          busy = true
          const controls = [trigger, save, restore]
          for (const control of controls)
            control.setAttribute('aria-disabled', 'true')
          status.textContent =
            action === 'save' ? 'Saving backup…' : 'Restoring backup…'
          try {
            await persistence[action]()
            status.textContent =
              action === 'save'
                ? 'Drawing backup saved.'
                : 'Drawing backup restored.'
          } catch (error) {
            status.textContent =
              error instanceof Error
                ? error.message
                : 'Drawing backup operation failed.'
          } finally {
            busy = false
            for (const control of controls)
              control.removeAttribute('aria-disabled')
          }
        }
        return [note, status, row]
      },
      () => {
        close = undefined
      },
    )
  })
  trigger.setAttribute('aria-haspopup', 'dialog')
  return { el: trigger, dispose: () => close?.() }
}

/** Edit a drawing's exact anchors and, for Fibonacci drawings, its visible ratios. */
export function openDrawingSettingsModal(
  host: HTMLElement,
  drawings: Annotations,
  id: string,
  onClose: () => void,
): (() => void) | undefined {
  const drawing = drawings.get(id)
  if (!drawing) return
  const { points, hiddenLevels } = drawing
  const levels = drawings.fibLevels(id)

  return openModal(
    host,
    'Drawing settings',
    close => {
      const form = el('form')
      const time = input('number', '')
      const price = input('number', '')
      time.step = price.step = 'any'
      let index = 0
      const edits = new Map<number, AnnotationPoint>()
      const readPoint = () => {
        const point = { time: time.valueAsNumber, price: price.valueAsNumber }
        const original = points[index]!
        if (point.time === original.time && point.price === original.price) {
          edits.delete(index)
        } else {
          edits.set(index, point)
        }
      }
      const showPoint = () => {
        const point = edits.get(index) ?? points[index]!
        time.value = Number.isFinite(point.time) ? String(point.time) : ''
        price.value = Number.isFinite(point.price) ? String(point.price) : ''
      }
      const picker = el('select', 'lf-input')
      if (points.length > 1) {
        for (let i = 0; i < points.length; i++) {
          const option = el('option', '', `Point ${i + 1}`)
          option.value = String(i)
          picker.append(option)
        }
        picker.addEventListener('change', () => {
          readPoint()
          index = picker.selectedIndex
          showPoint()
        })
        form.append(field('Anchor', picker))
      }
      showPoint()
      form.append(field('Time (Unix seconds)', time), field('Price', price))

      const checks = levels?.map(level => {
        const control = input('checkbox', '')
        control.checked = !hiddenLevels?.includes(level)
        return { level, control, initiallyChecked: control.checked }
      })
      if (checks) {
        const group = el('fieldset', 'lf-fib-levels')
        group.append(el('legend', '', 'Fibonacci levels'))
        const grid = el('div')
        for (const { level, control } of checks) {
          const label = el('label')
          label.append(control, String(level))
          grid.append(label)
        }
        group.append(grid)
        form.append(group)
      }

      const error = el('div', 'lf-error')
      error.setAttribute('role', 'alert')
      const { row } = actions(close, 'Apply')
      form.append(error, row)
      form.addEventListener('submit', e => {
        e.preventDefault()
        readPoint()
        const current = drawings.get(id)
        if (
          current?.type !== drawing.type ||
          current.points.length !== points.length
        ) {
          error.textContent =
            'The drawing changed. Reopen its settings to edit it.'
          return
        }
        const patch: AnnotationPatch = {}
        if (edits.size > 0) {
          for (const [i, point] of edits) {
            const original = points[i]!
            const validTime =
              point.time === original.time || Number.isInteger(point.time)
            if (!validTime || !Number.isFinite(point.price)) {
              error.textContent = validTime
                ? `Enter a numeric price for point ${i + 1}.`
                : `Enter whole Unix seconds for point ${i + 1}.`
              picker.value = String(i)
              index = i
              showPoint()
              ;(validTime ? price : time).focus()
              return
            }
            const target = current.points[i]!
            if (point.time !== original.time) target.time = point.time
            if (point.price !== original.price) target.price = point.price
          }
          patch.points = current.points
        }
        const changed = checks?.filter(
          ({ control, initiallyChecked }) =>
            control.checked !== initiallyChecked,
        )
        if (changed?.length) {
          const hidden = new Set(current.hiddenLevels)
          for (const { level, control } of changed) {
            if (control.checked) hidden.delete(level)
            else hidden.add(level)
          }
          patch.hiddenLevels = [...hidden]
        }
        try {
          if (patch.points || patch.hiddenLevels) drawings.update(id, patch)
        } catch (e) {
          error.textContent = (e as Error).message
          return
        }
        close()
      })
      return [form]
    },
    onClose,
  )
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

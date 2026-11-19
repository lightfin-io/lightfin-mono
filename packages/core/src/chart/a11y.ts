/**
 * The chart's screen-reader surface. The canvases are invisible to
 * assistive tech, so the chart element carries a label and a description of
 * what's on screen, and a polite live region announces the bar the keyboard
 * crosshair lands on.
 */
export class ChartA11y {
  private readonly root: HTMLElement
  private readonly description: HTMLElement
  private readonly live: HTMLElement

  constructor(root: HTMLElement) {
    this.root = root
    root.setAttribute('role', 'group')
    root.setAttribute('aria-roledescription', 'chart')
    this.description = hidden()
    this.description.id = `lf-chart-desc-${++seq}`
    this.live = hidden()
    this.live.setAttribute('aria-live', 'polite')
    root.setAttribute('aria-describedby', this.description.id)
    root.append(this.description, this.live)
  }

  setLabel(text: string): void {
    this.root.setAttribute('aria-label', text)
  }

  describe(text: string): void {
    this.description.textContent = text
  }

  announce(text: string): void {
    this.live.textContent = text
  }
}

let seq = 0

/** Visually hidden but read by screen readers. */
function hidden(): HTMLElement {
  const el = document.createElement('div')
  Object.assign(el.style, {
    position: 'absolute',
    width: '1px',
    height: '1px',
    overflow: 'hidden',
    clipPath: 'inset(50%)',
    whiteSpace: 'nowrap',
  })
  return el
}

export interface BarSummary {
  time: string
  open: string
  high: string
  low: string
  close: string
  /** Omitted when the data carries no volume. */
  volume?: string
}

/** One bar, as announced when the keyboard crosshair lands on it. */
export function describeBar(b: BarSummary): string {
  const volume = b.volume === undefined ? '' : `, volume ${b.volume}`
  return `${b.time}: open ${b.open}, high ${b.high}, low ${b.low}, close ${b.close}${volume}`
}

export interface ViewSummary {
  from: string
  to: string
  bars: number
  high: string
  low: string
  last: string
}

export const KEY_HINTS =
  'Arrow keys move between bars (Shift: 10 at a time), Home and End jump to the ends, plus and minus zoom.'

/** What's on screen, read when the chart takes focus. */
export function describeView(v: ViewSummary | null): string {
  if (!v) return `No data. ${KEY_HINTS}`
  return `Showing ${v.from} to ${v.to}, ${v.bars} bars. High ${v.high}, low ${v.low}, last close ${v.last}. ${KEY_HINTS}`
}

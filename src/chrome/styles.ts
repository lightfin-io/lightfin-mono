import type { ChartTheme } from '../chart/options'

const STYLE_ID = 'lightfin-chrome-styles'

/**
 * Chrome stylesheet. Every color reads a `--lf-*` variable set on the host
 * container from the chart theme (see {@link themeVars}), so the widgets
 * match the canvas without per-element styling.
 */
const CSS = `
.lf-host { display: flex; flex-direction: column; }
.lf-host > .lf-chart { flex: 1 1 0; min-height: 0; }

.lf-toolbar {
  display: flex; align-items: center; gap: 2px; flex: none;
  padding: 3px 6px; overflow-x: auto; scrollbar-width: none;
  background: var(--lf-bg); color: var(--lf-text);
  font: 12px/16px var(--lf-font); user-select: none;
}
.lf-toolbar-top { border-bottom: 1px solid var(--lf-border); }
.lf-toolbar-bottom { border-top: 1px solid var(--lf-border); }
.lf-sep { flex: none; width: 1px; height: 18px; margin: 0 4px; background: var(--lf-border); }
.lf-spacer { flex: 1; }

.lf-btn {
  appearance: none; border: 0; margin: 0; background: transparent;
  color: inherit; font: inherit; padding: 4px 8px; border-radius: 4px;
  display: inline-flex; align-items: center; gap: 4px;
  white-space: nowrap; cursor: pointer;
}
.lf-btn:hover { background: var(--lf-hover); color: var(--lf-text-strong); }
.lf-btn:focus-visible { outline: 1px solid var(--lf-accent); outline-offset: -1px; }
.lf-btn[aria-pressed='true'] { color: var(--lf-accent); }
.lf-btn-icon { padding: 4px; }
.lf-btn svg { display: block; width: 18px; height: 18px; }
.lf-clock { padding: 0 6px; font-variant-numeric: tabular-nums; white-space: nowrap; }

.lf-menu {
  position: absolute; z-index: 20; min-width: 220px; max-height: 60%;
  overflow-y: auto; padding: 4px; border-radius: 6px;
  background: var(--lf-panel); border: 1px solid var(--lf-border);
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.35); font: 13px/18px var(--lf-font);
}
.lf-menu .lf-btn { display: flex; width: 100%; padding: 6px 10px; }

.lf-hud {
  position: absolute; left: 8px; z-index: 1; pointer-events: none;
  color: var(--lf-text); font: 12px/20px var(--lf-font);
  font-variant-numeric: tabular-nums;
  text-shadow: 0 0 2px var(--lf-bg), 0 0 4px var(--lf-bg);
}
.lf-hud-legend { top: 4px; }
.lf-hud-row { display: flex; align-items: center; gap: 6px; height: 20px; white-space: nowrap; }
.lf-hud-title { color: var(--lf-text-strong); font-size: 13px; }
.lf-hud-dim { opacity: 0.7; }
.lf-hud-ind {
  width: max-content; margin-left: -4px; padding: 0 4px; border-radius: 4px;
  pointer-events: auto;
}
.lf-hud-ind:hover, .lf-hud-ind:focus-within { background: var(--lf-hud-hover); }
.lf-hud-ind[data-hidden] .lf-hud-label, .lf-hud-ind[data-hidden] .lf-hud-values { opacity: 0.45; }
.lf-hud-values { display: inline-flex; gap: 6px; }
.lf-hud-actions { display: inline-flex; opacity: 0; }
.lf-hud-ind:hover .lf-hud-actions, .lf-hud-ind:focus-within .lf-hud-actions { opacity: 1; }
.lf-hud-actions .lf-btn { padding: 1px; }
.lf-hud-actions .lf-btn svg { width: 16px; height: 16px; }

.lf-backdrop {
  position: absolute; inset: 0; z-index: 30; display: flex;
  align-items: center; justify-content: center; background: rgba(0, 0, 0, 0.45);
}
.lf-modal {
  min-width: 280px; max-width: calc(100% - 32px); max-height: calc(100% - 32px);
  overflow-y: auto; padding: 16px; border-radius: 8px;
  background: var(--lf-panel); border: 1px solid var(--lf-border);
  color: var(--lf-text-strong); font: 13px/18px var(--lf-font);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.45);
}
.lf-modal h2 { margin: 0 0 12px; font-size: 15px; font-weight: 600; }
.lf-tabs { display: flex; gap: 4px; margin-bottom: 12px; border-bottom: 1px solid var(--lf-border); }
.lf-tabs .lf-btn { border-radius: 4px 4px 0 0; }
.lf-field { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin: 8px 0; }
.lf-field label { color: var(--lf-text); }
.lf-input {
  min-width: 0; width: 150px; padding: 4px 6px; border-radius: 4px;
  border: 1px solid var(--lf-border); background: var(--lf-bg);
  color: var(--lf-text-strong); font: inherit;
}
.lf-input[type='color'] { width: 48px; height: 26px; padding: 1px 2px; }
.lf-input[type='checkbox'] { width: auto; }
.lf-input:focus { outline: 1px solid var(--lf-accent); outline-offset: -1px; }
.lf-error { min-height: 18px; color: var(--lf-down); font-size: 12px; }
.lf-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 12px; }
.lf-actions .lf-btn { border: 1px solid var(--lf-border); padding: 5px 14px; }
.lf-actions .lf-btn-primary { background: var(--lf-accent); border-color: var(--lf-accent); color: #fff; }
`

let refCount = 0

/** Add the shared stylesheet to the document (once, reference-counted). */
export function acquireStyles(): void {
  if (refCount++ > 0 || document.getElementById(STYLE_ID)) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = CSS
  document.head.appendChild(style)
}

export function releaseStyles(): void {
  if (--refCount > 0) return
  refCount = 0
  document.getElementById(STYLE_ID)?.remove()
}

/** CSS custom properties for the chrome, derived from the chart theme. */
export function themeVars(theme: Readonly<ChartTheme>): Record<string, string> {
  const dark = isDark(theme.background)
  return {
    '--lf-bg': theme.background,
    '--lf-text': theme.axisTextColor,
    '--lf-text-strong': dark ? '#d1d4dc' : '#131722',
    '--lf-border': theme.axisBorderColor,
    '--lf-accent': theme.lineColor,
    '--lf-up': theme.upColor,
    '--lf-down': theme.downColor,
    '--lf-font': theme.fontFamily,
    '--lf-hover': `color-mix(in srgb, ${theme.axisTextColor} 16%, transparent)`,
    '--lf-hud-hover': `color-mix(in srgb, ${theme.background} 70%, transparent)`,
    '--lf-panel': `color-mix(in srgb, ${theme.background} 92%, ${dark ? '#fff' : '#000'})`,
    'color-scheme': dark ? 'dark' : 'light',
  }
}

/** Whether a `#rgb`/`#rrggbb`/`rgb()` color is dark; unknown formats count as dark. */
function isDark(color: string): boolean {
  let r: number, g: number, b: number
  const hex = color.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)
  const rgb = color.match(/rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i)
  if (hex) {
    const h =
      hex[1]!.length === 3 ? [...hex[1]!].map(c => c + c).join('') : hex[1]!
    r = parseInt(h.slice(0, 2), 16)
    g = parseInt(h.slice(2, 4), 16)
    b = parseInt(h.slice(4, 6), 16)
  } else if (rgb) {
    ;[r, g, b] = [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])]
  } else {
    return true
  }
  return 0.299 * r + 0.587 * g + 0.114 * b < 140
}

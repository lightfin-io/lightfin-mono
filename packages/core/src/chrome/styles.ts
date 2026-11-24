import type { ChartTheme } from '../chart/options'

const STYLE_ID = 'lightfin-chrome-styles'

/**
 * Chrome stylesheet. Theme values read `--lf-*` variables set on the host
 * container (see {@link themeVars}).
 */
const CSS = `
.lf-host { display: flex; flex-direction: column; }
.lf-host > .lf-chart, .lf-host > .lf-body { flex: 1 1 0; min-height: 0; }
.lf-body { display: flex; }
.lf-body > .lf-chart { flex: 1 1 0; min-width: 0; }

.lf-toolbar {
  display: flex; align-items: center; gap: 2px; flex: none;
  padding: 3px 6px; overflow-x: auto; scrollbar-width: none;
  background: var(--lf-background); color: var(--lf-axisTextColor);
  font: 12px/16px var(--lf-fontFamily); user-select: none;
}
.lf-toolbar-top { border-bottom: 1px solid var(--lf-axisBorderColor); }
.lf-toolbar-bottom { border-top: 1px solid var(--lf-axisBorderColor); }
/* The fullscreen element is sized by the browser; paint the chart background
   so the toolbars don't sit on the default black backdrop. */
.lf-host:fullscreen { background: var(--lf-background); }
.lf-toolbar-left {
  flex-direction: column; padding: 6px 4px; overflow: hidden auto;
  border-right: 1px solid var(--lf-axisBorderColor);
}
.lf-toolbar-left .lf-sep { width: 18px; height: 1px; margin: 4px 0; }
.lf-sep { flex: none; width: 1px; height: 18px; margin: 0 4px; background: var(--lf-axisBorderColor); }
.lf-spacer { flex: 1; }

.lf-btn {
  appearance: none; border: 0; margin: 0; background: transparent;
  color: inherit; font: inherit; padding: 4px 8px; border-radius: 4px;
  display: inline-flex; align-items: center; gap: 4px;
  white-space: nowrap; cursor: pointer;
}
.lf-btn:hover { background: var(--lf-hover); color: var(--lf-textStrong); }
.lf-btn:is(:disabled, [aria-disabled='true']) { opacity: 0.4; cursor: default; }
.lf-btn:is(:disabled, [aria-disabled='true']):hover { background: transparent; color: inherit; }
.lf-btn:focus-visible { outline: 1px solid var(--lf-lineColor); outline-offset: -1px; }
.lf-btn[aria-pressed='true'] { color: var(--lf-lineColor); }
.lf-btn-icon { padding: 4px; }
.lf-btn svg { display: block; width: 18px; height: 18px; }
.lf-clock { padding: 0 6px; font-variant-numeric: tabular-nums; white-space: nowrap; }

.lf-menu {
  position: absolute; z-index: 20; min-width: 220px; max-height: 60%;
  overflow-y: auto; padding: 4px; border-radius: 6px;
  background: var(--lf-panel); border: 1px solid var(--lf-axisBorderColor);
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.35); font: 13px/18px var(--lf-fontFamily);
}
.lf-menu .lf-btn { display: flex; width: 100%; padding: 6px 10px; gap: 8px; }
.lf-menu .lf-btn[hidden] { display: none; }
.lf-menu .lf-btn[aria-checked='true'], .lf-menu .lf-btn[aria-pressed='true'] { color: var(--lf-lineColor); }
.lf-menu .lf-btn svg { flex: none; }
.lf-menu-label { padding: 6px 10px 2px; font-size: 11px; opacity: 0.7; }

/* Indicators menu: a pinned search field above a scrolling list. */
.lf-menu-indicators { display: flex; flex-direction: column; overflow: hidden; }
.lf-menu-search {
  display: flex; align-items: center; gap: 6px; margin: -4px -4px 4px;
  padding: 7px 10px; border-bottom: 1px solid var(--lf-axisBorderColor); color: var(--lf-axisTextColor);
}
.lf-menu-search svg { flex: none; width: 15px; height: 15px; opacity: 0.7; }
.lf-menu-search-input {
  flex: 1; min-width: 0; padding: 2px 0; border: 0; background: transparent;
  color: var(--lf-textStrong); font: inherit; outline: none;
}
.lf-menu-search-input::placeholder { color: var(--lf-axisTextColor); opacity: 0.7; }
.lf-menu-search-input::-webkit-search-cancel-button { -webkit-appearance: none; appearance: none; }
.lf-menu-list { overflow-y: auto; }
.lf-menu-empty { padding: 8px 10px; opacity: 0.6; }
.lf-sizes { display: grid; grid-template-columns: repeat(5, 1fr); }
.lf-menu .lf-sizes .lf-btn { justify-content: center; padding: 4px 0; }

.lf-tool-group { position: relative; }
.lf-tool-more {
  position: absolute; right: -3px; bottom: -3px; width: 12px; height: 12px;
  padding: 0; opacity: 0.5;
}
.lf-tool-more svg { width: 12px; height: 12px; }
.lf-tool-group:hover .lf-tool-more, .lf-tool-more:focus-visible,
.lf-tool-more[aria-expanded='true'] { opacity: 1; }

.lf-drawing-toolbar {
  position: absolute; z-index: 4; padding: 2px 4px; overflow: visible;
  border: 1px solid var(--lf-axisBorderColor); border-radius: 6px;
  background: var(--lf-panel); box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
}
.lf-drawing-toolbar[hidden] { display: none; }
.lf-grip { cursor: grab; opacity: 0.6; touch-action: none; }
.lf-grip svg { display: block; width: 12px; height: 18px; }
.lf-swatch-btn { flex-direction: column; gap: 1px; padding: 3px 4px 2px; }
.lf-swatch-btn svg { width: 16px; height: 16px; }
.lf-swatch {
  display: block; width: 18px; height: 4px; border-radius: 1px;
  box-shadow: inset 0 0 0 1px rgba(128, 128, 128, 0.4);
}
.lf-btn-sub { margin-left: 2px; font-size: 11px; font-variant-numeric: tabular-nums; }
.lf-btn-text { min-width: 26px; justify-content: center; font-weight: 600; }
.lf-btn.lf-italic { font-style: italic; font-family: Georgia, serif; }

.lf-colors { display: grid; grid-template-columns: repeat(10, 18px); gap: 3px; padding: 4px; }
.lf-color {
  appearance: none; width: 18px; height: 18px; padding: 0; margin: 0; cursor: pointer;
  border: 1px solid rgba(128, 128, 128, 0.35); border-radius: 3px;
}
.lf-color[aria-pressed='true'] { outline: 2px solid var(--lf-lineColor); outline-offset: 1px; }
.lf-color-row { display: flex; align-items: center; gap: 8px; padding: 6px 4px 4px; }
.lf-color-row input[type='range'] { flex: 1; min-width: 0; accent-color: var(--lf-lineColor); }
.lf-color-pct { width: 3em; text-align: right; font-variant-numeric: tabular-nums; }

.lf-hud {
  position: absolute; left: 8px; z-index: 1; pointer-events: none;
  color: var(--lf-axisTextColor); font: 12px/20px var(--lf-fontFamily);
  font-variant-numeric: tabular-nums;
  text-shadow: 0 0 2px var(--lf-background), 0 0 4px var(--lf-background);
}
.lf-hud-legend { top: 4px; }
.lf-hud-row { display: flex; align-items: center; gap: 6px; height: 20px; white-space: nowrap; }
.lf-hud-title { color: var(--lf-textStrong); font-size: 13px; }
.lf-hud-dim { opacity: 0.7; }
.lf-hud-ind {
  width: max-content; margin-left: -4px; padding: 0 4px; border-radius: 4px;
  pointer-events: auto;
}
.lf-hud-ind:hover, .lf-hud-ind:focus-within { background: var(--lf-hudHover); }
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
  background: var(--lf-panel); border: 1px solid var(--lf-axisBorderColor);
  color: var(--lf-textStrong); font: 13px/18px var(--lf-fontFamily);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.45);
}
.lf-modal h2 { margin: 0 0 12px; font-size: 15px; font-weight: 600; }
.lf-tabs { display: flex; gap: 4px; margin-bottom: 12px; border-bottom: 1px solid var(--lf-axisBorderColor); }
.lf-tabs .lf-btn { border-radius: 4px 4px 0 0; }
.lf-field { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin: 8px 0; }
.lf-field label { color: var(--lf-axisTextColor); }
.lf-input {
  min-width: 0; width: 150px; padding: 4px 6px; border-radius: 4px;
  border: 1px solid var(--lf-axisBorderColor); background: var(--lf-background);
  color: var(--lf-textStrong); font: inherit;
}
.lf-input[type='color'] { width: 48px; height: 26px; padding: 1px 2px; }
.lf-input[type='checkbox'] { width: auto; }
.lf-input:focus { outline: 1px solid var(--lf-lineColor); outline-offset: -1px; }
.lf-fib-levels { margin: 12px 0 8px; border: 1px solid var(--lf-axisBorderColor); border-radius: 4px; }
.lf-fib-levels div { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px 8px; }
.lf-fib-levels label { display: flex; align-items: center; gap: 4px; }
.lf-error { min-height: 18px; color: var(--lf-downColor); font-size: 12px; }
.lf-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 12px; }
.lf-actions .lf-btn { border: 1px solid var(--lf-axisBorderColor); padding: 5px 14px; }
.lf-actions .lf-btn-primary { background: var(--lf-lineColor); border-color: var(--lf-lineColor); color: #fff; }
.lf-reset-actions { display: grid; grid-template-columns: 1fr; margin-bottom: 8px; }
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

const chromeThemeKeys = [
  'background',
  'axisTextColor',
  'axisBorderColor',
  'lineColor',
  'upColor',
  'downColor',
  'fontFamily',
  'textStrong',
  'hover',
  'hudHover',
  'panel',
] as const satisfies readonly (keyof ChartTheme)[]

/** CSS properties to copy from the chart theme onto the chrome host. */
export function themeVars(theme: Readonly<ChartTheme>): Record<string, string> {
  const vars: Record<string, string> = { 'color-scheme': theme.colorScheme }
  for (const key of chromeThemeKeys) {
    vars[`--lf-${key}`] = theme[key]
  }
  return vars
}

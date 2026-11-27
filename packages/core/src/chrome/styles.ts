import type { ChartTheme } from '../chart/options'
import css from './chrome.css?inline'

const STYLE_ID = 'lightfin-chrome-styles'

let refCount = 0

/** Add the shared stylesheet to the document (once, reference-counted). */
export function acquireStyles(): void {
  if (refCount++ > 0 || document.getElementById(STYLE_ID)) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = css
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
  'buttonHoverBg',
  'hudHover',
  'overlayBg',
  'overlayTextColor',
  'overlayMutedColor',
  'overlayDivColor',
  'overlayHoverBg',
  'overlayFieldBg',
  'scrollbarColor',
  'scrollbarTrackColor',
] as const satisfies readonly (keyof ChartTheme)[]

/**
 * Theme values for the inline styles `createChrome` sets on the host. The
 * names are `--lf-theme-*` because an inline custom property beats a host
 * stylesheet. `chrome.css` copies each one onto the public `--lf-*` name, so
 * a host rule can replace `--lf-background` or `--lf-overlayBg` without
 * `!important`.
 */
export function themeVars(theme: Readonly<ChartTheme>): Record<string, string> {
  const vars: Record<string, string> = {
    '--lf-theme-color-scheme': theme.colorScheme,
  }
  for (const key of chromeThemeKeys) {
    vars[`--lf-theme-${key}`] = theme[key]
  }
  return vars
}

import { describe, expect, it } from 'vitest'

import { DEFAULT_OPTIONS, DEFAULT_THEME, resolveOptions } from './options.ts'

describe('resolveOptions', () => {
  it('returns defaults when given nothing', () => {
    expect(resolveOptions({})).toEqual(DEFAULT_OPTIONS)
  })

  it('overrides top-level options without dropping the rest', () => {
    const resolved = resolveOptions({ rightOffset: 12 })
    expect(resolved.rightOffset).toBe(12)
    expect(resolved.priceAxisWidth).toBe(DEFAULT_OPTIONS.priceAxisWidth)
  })

  it('deep-merges the theme so a partial theme keeps the other colors', () => {
    const resolved = resolveOptions({ theme: { upColor: '#fff' } })
    expect(resolved.theme.upColor).toBe('#fff')
    expect(resolved.theme.downColor).toBe(DEFAULT_THEME.downColor)
  })
})

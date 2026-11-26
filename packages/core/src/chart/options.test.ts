import { describe, expect, it } from 'vitest'

import { DEFAULT_OPTIONS, DEFAULT_THEME, resolveOptions } from './options'

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

  it('inherits the axis border color unless the pane divider has its own color', () => {
    const axisBorderColor = '#334455'
    expect(
      resolveOptions({ theme: { axisBorderColor } }).theme.paneBorderColor,
    ).toBe(axisBorderColor)
    expect(
      resolveOptions({ theme: { axisBorderColor, paneBorderColor: '#667788' } })
        .theme,
    ).toMatchObject({ axisBorderColor, paneBorderColor: '#667788' })
  })

  it('uses Gregorian dates and lets a custom formatter override the locale', () => {
    const date = new Date(Date.UTC(2024, 0, 5, 14, 30))
    const { dateFormatters } = resolveOptions({
      locale: 'th-TH',
      dateFormatters: { month: d => `month ${d.getUTCMonth() + 1}` },
    })
    const intl = (options: Intl.DateTimeFormatOptions) =>
      new Intl.DateTimeFormat('th-TH', {
        ...options,
        calendar: 'gregory',
        timeZone: 'UTC',
      }).format(date)

    expect(dateFormatters.month(date)).toBe('month 1')
    expect(dateFormatters.date(date)).toBe(
      intl({ month: 'short', day: 'numeric', year: 'numeric' }),
    )
    expect(dateFormatters.dateTime(date)).toBe(
      intl({
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      }),
    )
  })
})

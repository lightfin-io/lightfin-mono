import { describe, expect, it } from 'vitest'

import { KEY_HINTS, describeBar, describeView } from './a11y'

describe('describeBar', () => {
  const bar = {
    time: 'Jan 2 09:30',
    open: '1.00',
    high: '2.00',
    low: '0.50',
    close: '1.50',
  }

  it('reads OHLC, and volume when there is some', () => {
    expect(describeBar(bar)).toBe(
      'Jan 2 09:30: open 1.00, high 2.00, low 0.50, close 1.50',
    )
    expect(describeBar({ ...bar, volume: '1,200' })).toBe(
      'Jan 2 09:30: open 1.00, high 2.00, low 0.50, close 1.50, volume 1,200',
    )
  })
})

describe('describeView', () => {
  it('summarizes the visible range, then the keys', () => {
    expect(
      describeView({
        from: 'Jan 2 2024',
        to: 'Mar 1 2024',
        bars: 42,
        high: '120.00',
        low: '80.00',
        last: '101.25',
      }),
    ).toBe(
      `Showing Jan 2 2024 to Mar 1 2024, 42 bars. High 120.00, low 80.00, last close 101.25. ${KEY_HINTS}`,
    )
  })

  it('says so when there is no data', () => {
    expect(describeView(null)).toBe(`No data. ${KEY_HINTS}`)
  })
})

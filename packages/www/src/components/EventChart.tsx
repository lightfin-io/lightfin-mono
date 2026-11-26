import type { Bar, ChartOptionsInput } from '@lightfin/core'
import type { ChartEvent, EventTagPosition } from '@lightfin/core/event-tags'
import { LightfinChart, useChartEffect } from '@lightfin/react'
import { useEventTags } from '@lightfin/react/event-tags'
import { useId, useState } from 'react'

interface Selection {
  event: ChartEvent
  position: EventTagPosition
}

function Series({
  bars,
  events,
  card,
  onSelect,
  onDismiss,
}: {
  bars: readonly Bar[]
  events: readonly ChartEvent[]
  card: HTMLDivElement | null
  onSelect: (event: ChartEvent, position: EventTagPosition) => void
  onDismiss: () => void
}) {
  useChartEffect(
    chart => {
      chart.addCandlestickSeries().setData(bars)
    },
    [bars],
  )

  useEventTags({ events, card, onSelect, onDismiss })
  return null
}

export function EventChart({
  bars,
  events,
  theme,
}: {
  bars: readonly Bar[]
  events: readonly ChartEvent[]
  theme?: ChartOptionsInput['theme']
}) {
  const [selection, setSelection] = useState<Selection | null>(null)
  const [card, setCard] = useState<HTMLDivElement | null>(null)
  const titleId = useId()

  return (
    <div className="event-frame">
      <LightfinChart
        className="event-chart"
        style={{ height: 360 }}
        options={{ volumeVisible: true, theme }}
      >
        <Series
          bars={bars}
          events={events}
          card={card}
          onSelect={(event, position) => setSelection({ event, position })}
          onDismiss={() => setSelection(null)}
        />
      </LightfinChart>
      <div
        ref={setCard}
        className="event-card"
        role="dialog"
        aria-labelledby={titleId}
        hidden={!selection}
        style={
          selection
            ? {
                left: selection.position.point.x,
                top: selection.position.point.y,
              }
            : undefined
        }
      >
        <strong id={titleId}>{selection?.event.title ?? 'Event'}</strong>
        {selection?.event.body && <span>{selection.event.body}</span>}
      </div>
    </div>
  )
}

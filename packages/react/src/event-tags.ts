import { addEventTags } from '@lightfin/core/event-tags'
import type { EventTags, EventTagsOptions } from '@lightfin/core/event-tags'
import { useRef } from 'react'

import { useChartEffect } from './hooks'

export interface UseEventTagsOptions extends Pick<
  EventTagsOptions,
  'events' | 'onSelect' | 'onDismiss'
> {
  /** The host's detail card. Use a callback ref to pass its DOM element. */
  card?: HTMLElement | null
}

/** Attach tags to the nearest chart and update them as the events prop changes. */
export function useEventTags({
  events,
  card,
  onSelect,
  onDismiss,
}: UseEventTagsOptions): void {
  const handleRef = useRef<EventTags | null>(null)
  const callbacks = useRef({ onSelect, onDismiss })
  callbacks.current = { onSelect, onDismiss }
  const hasDismissHandler = onDismiss !== undefined

  useChartEffect(
    chart => {
      const handle = addEventTags(chart, {
        events: [],
        card: card ?? undefined,
        onSelect: (event, position) =>
          callbacks.current.onSelect?.(event, position),
        onDismiss: hasDismissHandler
          ? () => callbacks.current.onDismiss?.()
          : undefined,
      })
      handleRef.current = handle
      return () => {
        handleRef.current = null
        handle.remove()
      }
    },
    [card, hasDismissHandler],
  )

  useChartEffect(
    () => handleRef.current?.setEvents(events),
    [events, card, hasDismissHandler],
  )
}

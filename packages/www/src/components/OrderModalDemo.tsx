import type { Bar } from '@lightfin/core'
import { useState } from 'react'

import { OrderChart } from './OrderChart'
import type { OrderRequest } from './OrderChart'

import './order-modal.css'

const closeAt = (i: number) =>
  100 + i * 0.12 + 2.5 * Math.sin(i / 8) + 0.9 * Math.sin(i * 1.7)

const bars: Bar[] = Array.from({ length: 72 }, (_, i) => {
  const open = closeAt(i - 1)
  const close = closeAt(i)
  return {
    time: 1704067200 + i * 3600,
    open,
    high: Math.max(open, close) + 0.6 + (i % 4) * 0.15,
    low: Math.min(open, close) - 0.5 - (i % 3) * 0.2,
    close,
  }
})

export default function OrderModalDemo() {
  const [orderRequest, setOrderRequest] = useState<OrderRequest | null>(null)

  return (
    <div className="order-demo not-content">
      <OrderChart bars={bars} onOrderRequest={setOrderRequest} />
      <output aria-live="polite">
        {orderRequest &&
          `Order request received · ${orderRequest.side === 'buy' ? 'Buy' : 'Sell'} ${orderRequest.quantity} at ${orderRequest.price.toFixed(2)}`}
      </output>
    </div>
  )
}

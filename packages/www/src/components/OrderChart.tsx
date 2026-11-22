import type { Bar } from '@lightfin/core'
import { LightfinChart, useChartEffect } from '@lightfin/react'
import { useId, useRef } from 'react'
import type { SyntheticEvent } from 'react'

export interface OrderRequest {
  price: number
  side: 'buy' | 'sell'
  quantity: number
}

function Candles({ bars }: { bars: readonly Bar[] }) {
  useChartEffect(chart => chart.addCandlestickSeries().setData(bars), [bars])
  return null
}

export function OrderChart({
  bars,
  onOrderRequest,
}: {
  bars: readonly Bar[]
  onOrderRequest: (orderRequest: OrderRequest) => void
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const priceRef = useRef<HTMLInputElement>(null)
  const titleId = useId()
  const lastClose = bars.at(-1)?.close

  function openOrder(price: number) {
    const dialog = dialogRef.current
    const priceInput = priceRef.current
    if (!dialog || !priceInput) return

    priceInput.form?.reset()
    priceInput.value = price.toFixed(2)
    dialog.showModal()
  }

  function submitOrderRequest(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault()
    const fields = new FormData(event.currentTarget)
    const orderRequest: OrderRequest = {
      price: Number(fields.get('price')),
      side: fields.get('side') === 'sell' ? 'sell' : 'buy',
      quantity: Number(fields.get('quantity')),
    }
    dialogRef.current?.close()
    onOrderRequest(orderRequest)
  }

  return (
    <>
      <LightfinChart
        className="order-chart"
        style={{ height: 320 }}
        onOrderIntent={({ price }) => openOrder(price)}
      >
        <Candles bars={bars} />
      </LightfinChart>

      <button
        type="button"
        aria-haspopup="dialog"
        disabled={lastClose === undefined}
        onClick={() => {
          if (lastClose !== undefined) openOrder(lastClose)
        }}
      >
        New order at last close
      </button>

      <dialog
        ref={dialogRef}
        className="order-dialog"
        aria-labelledby={titleId}
      >
        <form onSubmit={submitOrderRequest}>
          <h3 id={titleId}>Limit order</h3>
          <label>
            Limit price
            <input
              ref={priceRef}
              name="price"
              type="number"
              min="0.01"
              step="0.01"
              required
            />
          </label>
          <label>
            Side
            <select name="side" defaultValue="buy">
              <option value="buy">Buy</option>
              <option value="sell">Sell</option>
            </select>
          </label>
          <label>
            Quantity
            <input
              name="quantity"
              type="number"
              min="1"
              step="1"
              defaultValue="1"
              required
            />
          </label>
          <div className="order-actions">
            <button type="button" onClick={() => dialogRef.current?.close()}>
              Cancel
            </button>
            <button type="submit">Place order</button>
          </div>
        </form>
      </dialog>
    </>
  )
}

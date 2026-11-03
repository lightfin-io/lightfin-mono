import { createChart } from 'lightfin-web-chart'

import { generateBars } from './sampleData.ts'

import './style.css'

const container = document.querySelector<HTMLDivElement>('#chart')!

const chart = createChart(container, { volumeVisible: true })
const candles = chart.addCandlestickSeries()
candles.setData(generateBars(500))

// Expose for manual poking in the console.
Object.assign(window as unknown as Record<string, unknown>, { chart, candles })

import { createChart } from 'lightfin-web-chart'

import './style.css'

const container = document.querySelector<HTMLDivElement>('#chart')!

createChart(container)

import coreSizes from '../../../core/size.json'
import reactSizes from '../../../react/size.json'

interface SizeCheck {
  name: string
  size: number
}

// The full Lightfin bar occupies this much of the track. The comparison bar
// is pinned at 100% and stands for a 2 MB bundle, so the two Lightfin bars
// stay to scale with each other while the competitor stays capped.
const FULL_BAR_WIDTH = 40
const COMPETITOR_BYTES = 2_000_000

const CORE_CHECK = 'core (createChart)'
const FULL_CHECK =
  'everything (core + chrome + annotations + price lines + indicators)'
const REACT_CHECK = 'react wrapper (glue only; react + core external)'

/** Same formatter size-limit uses for its brotli byte counts. */
function formatBytes(size: number): string {
  const units = ['B', 'kB', 'MB', 'GB']
  let power = 0
  while (Math.abs(size) >= 1000 ** (power + 1) && power < units.length - 1) {
    power += 1
  }
  return parseFloat((size / 1000 ** power).toFixed(2)) + ' ' + units[power]
}

function sizeOf(checks: SizeCheck[], name: string, file: string): number {
  const hit = checks.find(check => check.name === name)
  if (!hit || typeof hit.size !== 'number') {
    throw new Error(`${file} is missing a "${name}" size`)
  }
  return hit.size
}

const coreBytes = sizeOf(coreSizes, CORE_CHECK, 'packages/core/size.json')
const fullBytes = sizeOf(coreSizes, FULL_CHECK, 'packages/core/size.json')
const reactBytes = sizeOf(reactSizes, REACT_CHECK, 'packages/react/size.json')

export const bundles = [
  {
    label: 'Core',
    size: formatBytes(coreBytes),
    width: Math.round((coreBytes / fullBytes) * FULL_BAR_WIDTH),
    tone: 'lean' as const,
  },
  {
    label: 'Core + chrome + all indicators & annotations',
    size: formatBytes(fullBytes),
    width: FULL_BAR_WIDTH,
    tone: 'lean' as const,
  },
  {
    label: 'Some other full-featured charting libraries',
    size: '2 MB+',
    width: 100,
    tone: 'heavy' as const,
  },
]

/** Brotli size of the React wrapper, with React and the core left external. */
export const reactSize = formatBytes(reactBytes)

/** How many times a 2 MB bundle outweighs the full Lightfin build. */
export const competitorMultiple = Math.round(COMPETITOR_BYTES / fullBytes)

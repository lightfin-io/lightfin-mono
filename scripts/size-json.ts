/**
 * Writes `size.json` from `size-limit --json`.
 *
 * On a miss, size-limit prints the report to stdout and exits 1 with nothing
 * on stderr. `size-limit --json > size.json` therefore fails as a bare exit
 * code. This keeps the file, and names each failing check with its size and
 * its limit.
 */
import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

interface SizeCheck {
  name?: string
  passed?: boolean
  size?: number
  sizeLimit?: number
}

const require = createRequire(import.meta.url)
const sizeLimitBin = join(
  dirname(require.resolve('size-limit/package.json')),
  'bin.js',
)

const UNITS = ['B', 'kB', 'MB', 'GB']

/** Same formatter size-limit uses, so the message matches its kB figures. */
function formatBytes(size: number): string {
  let power = 0
  while (Math.abs(size) >= 1000 ** (power + 1) && power < UNITS.length - 1) {
    power += 1
  }
  return parseFloat((size / 1000 ** power).toFixed(2)) + ' ' + UNITS[power]
}

function packageName(): string {
  try {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as {
      name?: string
    }
    return pkg.name ?? 'package'
  } catch {
    return 'package'
  }
}

export function formatSizeFailure(pkg: string, checks: SizeCheck[]): string {
  const lines = [`${pkg}: size limit exceeded (.size-limit.json)`, '']
  for (const check of checks) {
    const name = check.name ?? '(unnamed check)'
    if (typeof check.size !== 'number' || typeof check.sizeLimit !== 'number') {
      lines.push(`  ${name}: failed`, '')
      continue
    }
    const over = check.size - check.sizeLimit
    lines.push(
      `  ${name}`,
      `    size:   ${formatBytes(check.size)} (${check.size} B)`,
      `    limit:  ${formatBytes(check.sizeLimit)} (${check.sizeLimit} B)`,
      `    over by ${over} B`,
      '',
    )
  }
  return lines.join('\n').trimEnd()
}

function failingChecks(stdout: string): SizeCheck[] | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(stdout)
  } catch {
    return null
  }
  if (!Array.isArray(parsed)) return null
  return parsed.filter((check): check is SizeCheck => {
    if (!check || typeof check !== 'object') return false
    return (check as SizeCheck).passed === false
  })
}

function sizeLimitError(stdout: string): string | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(stdout)
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object' || !('error' in parsed)) return null
  const error = (parsed as { error: unknown }).error
  return typeof error === 'string' ? error : null
}

function main(): void {
  const result = spawnSync(process.execPath, [sizeLimitBin, '--json'], {
    encoding: 'utf8',
    stdio: ['inherit', 'pipe', 'pipe'],
  })

  if (result.error) {
    console.error(`size-limit failed to start: ${result.error.message}`)
    process.exit(1)
  }

  const stdout = result.stdout ?? ''
  const stderr = result.stderr ?? ''
  if (stdout) writeFileSync('size.json', stdout)

  if (result.status === 0) process.exit(0)

  const failed = failingChecks(stdout)
  if (failed && failed.length > 0) {
    console.error(formatSizeFailure(packageName(), failed))
    process.exit(result.status ?? 1)
  }

  const error = sizeLimitError(stdout)
  if (error) console.error(error)
  if (stderr) {
    process.stderr.write(stderr.endsWith('\n') ? stderr : `${stderr}\n`)
  }
  if (!error && !stderr.trim()) {
    console.error(`size-limit exited with code ${result.status ?? 1}`)
  }
  process.exit(result.status ?? 1)
}

if (import.meta.main) main()

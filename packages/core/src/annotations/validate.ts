import { TOOLS } from './tools'
import type { AnnotationType } from './types'

export const MARKER_SHAPES = ['arrowUp', 'arrowDown', 'circle', 'flag'] as const
export const LINE_STYLES = ['solid', 'dashed', 'dotted'] as const
export const LINE_ENDS = ['none', 'start', 'end', 'both'] as const

const FIELDS = [
  'id',
  'type',
  'points',
  'style',
  'text',
  'shape',
  'locked',
  'hidden',
  'group',
]
const STYLE_FIELDS = [
  'color',
  'lineWidth',
  'lineStyle',
  'fillColor',
  'fontSize',
  'fontFamily',
  'bold',
  'italic',
  'textColor',
  'extend',
  'arrow',
]
// Unix seconds stay below this until the year 5138; larger is milliseconds.
const MAX_SECONDS = 1e11

/**
 * What's wrong with an annotation from an untrusted source — an AI's tool
 * call, a stale save — one sentence per problem, naming the field. Empty when
 * it's valid. `add()`, `load()`, `replace()`, and `update()` throw with these,
 * so a model can be handed the message and asked to fix its input.
 */
export function validateAnnotation(input: unknown): string[] {
  if (!isObject(input)) return ['an annotation must be an object']
  const errors: string[] = []
  const { type, points, style, text, shape, id, group, locked, hidden } = input
  const spec =
    typeof type === 'string' && Object.hasOwn(TOOLS, type)
      ? TOOLS[type as AnnotationType]
      : undefined

  for (const key of Object.keys(input)) {
    if (!FIELDS.includes(key)) errors.push(`unknown field "${key}"`)
  }
  if (!spec) {
    errors.push(
      `type must be one of ${list(Object.keys(TOOLS))}, got ${JSON.stringify(type)}`,
    )
  }
  if (!Array.isArray(points)) {
    errors.push('points must be an array of { time, price }')
  } else {
    if (spec?.freehand && points.length < spec.points) {
      errors.push(
        `a ${type} annotation takes at least ${spec.points} points, got ${points.length}`,
      )
    } else if (spec && !spec.freehand && points.length !== spec.points) {
      errors.push(
        `a ${type} annotation takes ${spec.points} point(s), got ${points.length}`,
      )
    }
    points.forEach((p: unknown, i) => {
      if (!isObject(p)) {
        errors.push(`points[${i}] must be an object { time, price }`)
        return
      }
      if (!isNumber(p.time)) {
        errors.push(`points[${i}].time must be a Unix timestamp in seconds`)
      } else if (p.time > MAX_SECONDS) {
        errors.push(
          `points[${i}].time looks like milliseconds; use Unix seconds`,
        )
      }
      if (!isNumber(p.price)) {
        errors.push(`points[${i}].price must be a finite number`)
      }
    })
  }
  if (id !== undefined && (typeof id !== 'string' || id === '')) {
    errors.push('id must be a non-empty string')
  }
  if (group !== undefined && typeof group !== 'string') {
    errors.push('group must be a string')
  }
  if (text !== undefined && typeof text !== 'string') {
    errors.push('text must be a string')
  }
  if (shape !== undefined && !includes(MARKER_SHAPES, shape)) {
    errors.push(`shape must be one of ${list(MARKER_SHAPES)}`)
  }
  if (locked !== undefined && typeof locked !== 'boolean') {
    errors.push('locked must be a boolean')
  }
  if (hidden !== undefined && typeof hidden !== 'boolean') {
    errors.push('hidden must be a boolean')
  }
  if (style !== undefined) {
    if (isObject(style)) errors.push(...validateStyle(style))
    else errors.push('style must be an object')
  }
  return errors
}

function validateStyle(style: Record<string, unknown>): string[] {
  const errors: string[] = []
  for (const key of Object.keys(style)) {
    if (!STYLE_FIELDS.includes(key)) errors.push(`unknown field "style.${key}"`)
  }
  for (const key of ['color', 'fillColor', 'textColor']) {
    if (style[key] !== undefined && typeof style[key] !== 'string') {
      errors.push(`style.${key} must be a CSS color string`)
    }
  }
  if (
    style.fontFamily !== undefined &&
    (typeof style.fontFamily !== 'string' || style.fontFamily === '')
  ) {
    errors.push('style.fontFamily must be a non-empty CSS font family')
  }
  for (const key of ['lineWidth', 'fontSize']) {
    const v = style[key]
    if (v !== undefined && !(isNumber(v) && v > 0)) {
      errors.push(`style.${key} must be a positive number`)
    }
  }
  for (const key of ['bold', 'italic']) {
    if (style[key] !== undefined && typeof style[key] !== 'boolean') {
      errors.push(`style.${key} must be a boolean`)
    }
  }
  if (
    style.lineStyle !== undefined &&
    !includes(LINE_STYLES, style.lineStyle)
  ) {
    errors.push(`style.lineStyle must be one of ${list(LINE_STYLES)}`)
  }
  for (const key of ['extend', 'arrow']) {
    if (style[key] !== undefined && !includes(LINE_ENDS, style[key])) {
      errors.push(`style.${key} must be one of ${list(LINE_ENDS)}`)
    }
  }
  return errors
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function isNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

function includes(values: readonly string[], v: unknown): boolean {
  return typeof v === 'string' && values.includes(v)
}

function list(values: readonly string[]): string {
  return values.map(v => `"${v}"`).join(', ')
}

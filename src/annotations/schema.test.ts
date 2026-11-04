import { describe, expect, it } from 'vitest'

import { annotateChartTool, annotationSchema } from './schema'
import { TOOLS } from './tools'
import {
  LINE_ENDS,
  LINE_STYLES,
  MARKER_SHAPES,
  validateAnnotation,
} from './validate'

// The schema spells out its enums rather than importing them, so its chunk
// carries no drawing code; these keep the two in step.
describe('annotationSchema', () => {
  const { properties } = annotationSchema

  it('lists every annotation type, marker shape, line style, and line end', () => {
    expect([...properties.type.enum].sort()).toEqual(Object.keys(TOOLS).sort())
    expect(properties.shape.enum).toEqual(MARKER_SHAPES)
    const style = properties.style.properties
    expect(style.lineStyle.enum).toEqual(LINE_STYLES)
    expect(style.extend.enum).toEqual(LINE_ENDS)
    expect(style.arrow.enum).toEqual(LINE_ENDS)
  })

  it('describes only fields the validator accepts', () => {
    const input: Record<string, unknown> = {}
    for (const key of Object.keys(properties)) input[key] = undefined
    const style: Record<string, unknown> = {}
    for (const key of Object.keys(properties.style.properties)) {
      style[key] = undefined
    }
    Object.assign(input, {
      type: 'marker',
      points: [{ time: 1_700_000_000, price: 1 }],
      style,
    })
    expect(validateAnnotation(input)).toEqual([])
  })

  it('wraps it in a tool taking a list of annotations', () => {
    expect(annotateChartTool.inputSchema.properties.annotations.items).toBe(
      annotationSchema,
    )
  })
})

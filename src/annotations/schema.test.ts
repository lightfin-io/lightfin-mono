import { describe, expect, it } from 'vitest'

import { annotateChartTool, annotationSchema } from './schema'
import { TOOLS } from './tools'
import { LINE_STYLES, MARKER_SHAPES, validateAnnotation } from './validate'

// The schema spells out its enums rather than importing them, so its chunk
// carries no drawing code; these keep the two in step.
describe('annotationSchema', () => {
  const { properties } = annotationSchema

  it('lists every annotation type, marker shape, and line style', () => {
    expect([...properties.type.enum].sort()).toEqual(Object.keys(TOOLS).sort())
    expect(properties.shape.enum).toEqual(MARKER_SHAPES)
    expect(properties.style.properties.lineStyle.enum).toEqual(LINE_STYLES)
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

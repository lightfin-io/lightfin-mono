/**
 * @lightfin/core/annotations/schema — JSON Schema for annotations, for
 * handing to an AI model as a tool definition (PLAN §8.7).
 *
 * Plain data in its own subpath, so the drawing code never carries it:
 *
 * ```ts
 * import { annotateChartTool } from '@lightfin/core/annotations/schema'
 *
 * // Anthropic: { name, description, input_schema: annotateChartTool.inputSchema }
 * // OpenAI:    { type: 'function', function: { name, description, parameters } }
 * // MCP:       annotateChartTool as-is
 *
 * // When the model calls it:
 * try {
 *   drawings.replace('ai', input.annotations)
 * } catch (e) {
 *   // Return (e as Error).message as the tool result so the model can retry.
 * }
 * ```
 */

const point = {
  type: 'object',
  properties: {
    time: {
      type: 'integer',
      description:
        'Unix time in seconds (not milliseconds). Use the time of a bar from the chart data you were given.',
    },
    price: {
      type: 'number',
      description: 'A price on the chart’s price scale.',
    },
  },
  required: ['time', 'price'],
  additionalProperties: false,
} as const

/** JSON Schema for one annotation, as `drawings.add()` / `replace()` accept it. */
export const annotationSchema = {
  type: 'object',
  description: 'One drawing on the price chart.',
  properties: {
    type: {
      type: 'string',
      enum: [
        'trendline',
        'hline',
        'vline',
        'hray',
        'crossline',
        'channel',
        'pitchfork',
        'regression',
        'fib',
        'fibExtension',
        'rectangle',
        'ellipse',
        'triangle',
        'brush',
        'text',
        'callout',
        'priceLabel',
        'marker',
        'longPosition',
        'shortPosition',
        'measure',
      ],
      description:
        'Point counts in brackets. ' +
        'trendline [2]: a segment (trends); style.extend makes it a ray. ' +
        'hline [1]: a horizontal line at a price (support, resistance). hray [1]: one running right from its point. ' +
        'vline [1]: a vertical line at a time (events). crossline [1]: both. ' +
        'channel [3]: a line through points 1–2 and its parallel through point 3. ' +
        'pitchfork [3]: Andrews’ pitchfork from a pivot (1) and two reactions (2, 3). ' +
        'regression [2]: a fitted trend of the closes between two times, with ±2σ bands. ' +
        'fib [2]: retracement levels from swing start (1) to swing end (2). ' +
        'fibExtension [3]: extension levels of move 1→2 projected from point 3. ' +
        'rectangle, ellipse [2]: shaded zones between opposite corners. triangle [3]. brush [2+]: a freehand stroke. ' +
        'text [1]: a label. callout [2]: a labelled box (2) pointing at a bar (1). priceLabel [1]: a bubble with the price. ' +
        'marker [1]: an arrow, dot, or flag at a bar (signals). ' +
        'longPosition, shortPosition [3]: entry (1, the box’s left edge), target (2, its right edge), stop (3’s price). ' +
        'measure [2]: price change, bars, and time between two points.',
    },
    points: {
      type: 'array',
      items: point,
      minItems: 1,
      description: 'As many as the type takes (see type).',
    },
    text: {
      type: 'string',
      description:
        'A short caption beside the drawing (the label itself for text and callout). Keep it to a few words.',
    },
    shape: {
      type: 'string',
      enum: ['arrowUp', 'arrowDown', 'circle', 'flag'],
      description:
        'Markers only. arrowUp draws below its point pointing up (bullish; put the point at the bar’s low). ' +
        'arrowDown draws above pointing down (bearish; put it at the high). circle sits on the point, flag stands on it. Default circle.',
    },
    locked: {
      type: 'boolean',
      description: 'Keep the user from moving it by accident.',
    },
    id: {
      type: 'string',
      description:
        'Optional id, unique on the chart, to refer back to this drawing later.',
    },
    style: {
      type: 'object',
      description: 'Optional; omit to use the chart theme’s colors.',
      properties: {
        color: {
          type: 'string',
          description:
            'CSS color of the line, text, or marker, e.g. "#26a69a" or "red".',
        },
        lineWidth: { type: 'number', description: 'Line width in px.' },
        lineStyle: { type: 'string', enum: ['solid', 'dashed', 'dotted'] },
        fillColor: {
          type: 'string',
          description:
            'Shape fill or text background, usually translucent, e.g. "rgba(38,166,154,0.15)".',
        },
        fontSize: { type: 'number', description: 'Text size in px.' },
        fontFamily: { type: 'string' },
        bold: { type: 'boolean' },
        italic: { type: 'boolean' },
        textColor: {
          type: 'string',
          description: 'Caption color, if not the line color.',
        },
        extend: {
          type: 'string',
          enum: ['none', 'start', 'end', 'both'],
          description:
            'trendline/channel: run past the 1st point (start), the 2nd (end), or both.',
        },
        arrow: {
          type: 'string',
          enum: ['none', 'start', 'end', 'both'],
          description: 'trendline: arrowheads on those ends.',
        },
      },
      additionalProperties: false,
    },
  },
  required: ['type', 'points'],
  additionalProperties: false,
} as const

/**
 * A ready-made tool definition (MCP's `{ name, description, inputSchema }`
 * shape) whose input is `{ annotations }`, for `drawings.replace(group,
 * input.annotations)`: each call replaces the model's previous drawings.
 */
export const annotateChartTool = {
  name: 'annotate_chart',
  description:
    'Draw annotations on the user’s price chart to illustrate your analysis: ' +
    'support and resistance lines, trendlines, zones, Fibonacci retracements, and markers on notable bars, each with a short caption. ' +
    'Each call replaces the annotations from your previous call (pass an empty list to remove them); the user’s own drawings are kept. ' +
    'Anchor every point to a bar time (Unix seconds) and price from the chart data. Prefer a few meaningful annotations over many.',
  inputSchema: {
    type: 'object',
    properties: {
      annotations: { type: 'array', items: annotationSchema },
    },
    required: ['annotations'],
    additionalProperties: false,
  },
} as const

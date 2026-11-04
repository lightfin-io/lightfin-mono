/**
 * lightfin-web-chart/annotations/schema — JSON Schema for annotations, for
 * handing to an AI model as a tool definition (PLAN §8.7).
 *
 * Plain data in its own subpath, so the drawing code never carries it:
 *
 * ```ts
 * import { annotateChartTool } from 'lightfin-web-chart/annotations/schema'
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
        'rectangle',
        'fib',
        'text',
        'marker',
      ],
      description:
        'trendline: a segment between 2 points (trends, channels). ' +
        'hline: a horizontal line at 1 point’s price (support, resistance, targets). ' +
        'vline: a vertical line at 1 point’s time (events, session breaks). ' +
        'rectangle: a shaded box between 2 opposite corners (ranges, zones). ' +
        'fib: Fibonacci retracement levels from the 1st point (swing start) to the 2nd (swing end). ' +
        'text: a free-standing label at 1 point. ' +
        'marker: an arrow or dot at 1 bar (signals, pattern points).',
    },
    points: {
      type: 'array',
      items: point,
      minItems: 1,
      maxItems: 2,
      description:
        '2 points for trendline, rectangle, and fib; 1 for hline, vline, text, and marker.',
    },
    text: {
      type: 'string',
      description:
        'A short caption shown beside the drawing (the label itself for type text). Keep it to a few words.',
    },
    shape: {
      type: 'string',
      enum: ['arrowUp', 'arrowDown', 'circle'],
      description:
        'Markers only. arrowUp draws below its point pointing up (bullish; put the point at the bar’s low). ' +
        'arrowDown draws above pointing down (bearish; put it at the high). circle sits on the point. Default circle.',
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
            'Rectangle fill, usually translucent, e.g. "rgba(38,166,154,0.15)".',
        },
        fontSize: { type: 'number', description: 'Text size in px.' },
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

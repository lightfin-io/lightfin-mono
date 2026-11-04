import type { DrawEnv, Resolved, ToolSpec } from './draw'
import { clearLabelBox, fillLabel, labelBox } from './draw'
import { FIB_TOOLS } from './fib'
import type { Px } from './geometry'
import { inBox } from './geometry'
import { LABEL_TOOLS } from './labels'
import { LINE_TOOLS } from './lines'
import { MEASURE_TOOLS } from './measure'
import { SHAPE_TOOLS } from './shapes'
import type { AnnotationType } from './types'

export type { DrawEnv, Resolved, ResolvedStyle, ToolSpec } from './draw'
export { HIT_SLOP, effectiveStyle, labelBox, resolveStyle } from './draw'
export { FIB_EXTENSION_LEVELS, FIB_LEVELS } from './fib'

export const TOOLS: Record<AnnotationType, ToolSpec> = {
  ...LINE_TOOLS,
  ...FIB_TOOLS,
  ...SHAPE_TOOLS,
  ...LABEL_TOOLS,
  ...MEASURE_TOOLS,
}

/** Paint a drawing and its caption. */
export function drawAnnotation(
  ctx: CanvasRenderingContext2D,
  r: Resolved,
  env: DrawEnv,
): void {
  const spec = TOOLS[r.ann.type]
  clearLabelBox(r.ann)
  spec.draw(ctx, r, env)
  if (r.ann.text && spec.caption) {
    fillLabel(ctx, r, r.ann.text, spec.caption(r, env))
  }
}

/** Whether `p` grabs a drawing: its shape, or its label as last painted. */
export function hitAnnotation(r: Resolved, p: Px): boolean {
  if (TOOLS[r.ann.type].hit(r, p)) return true
  const box = labelBox(r.ann)
  return !!box && inBox(p, box.a, box.b, 2)
}

/** Where each of a drawing's handles is drawn. */
export function handlePositions(r: Resolved): Px[] {
  const spec = TOOLS[r.ann.type]
  return spec.handles.map(
    ([a, b], i) => spec.handleAt?.(r, i) ?? { x: r.px[a]!.x, y: r.px[b]!.y },
  )
}

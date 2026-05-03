export const JOIST_W   = 0.045
export const JOIST_H   = 0.070
export const BEAM_W    = 0.045
export const BEAM_H    = 0.195
export const POST_W    = 0.090
export const FOOTING_W = 0.300
export const FOOTING_H = 0.150
export const JOIST_CC  = 0.600
export const POST_CC   = 1.800

// Divides [x0, x1] into ceil((x1-x0)/cc) equal intervals — spacing always ≤ cc
export function spanPositions(x0: number, x1: number, cc: number): number[] {
  const count = Math.max(1, Math.ceil((x1 - x0) / cc))
  return Array.from({ length: count + 1 }, (_, i) => x0 + (i / count) * (x1 - x0))
}

export function getJoistXPositions(minX: number, maxX: number): number[] {
  return spanPositions(minX, maxX, JOIST_CC)
}

export function getPostXPositions(minX: number, maxX: number): number[] {
  return spanPositions(minX, maxX, POST_CC)
}

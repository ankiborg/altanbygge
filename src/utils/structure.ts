import type { Point } from '@/types/deck'

export const JOIST_W        = 0.045
export const JOIST_H        = 0.070
export const BEAM_W         = 0.045
export const BEAM_H         = 0.195
export const POST_W         = 0.090
export const FOOTING_W      = 0.300
export const FOOTING_H      = 0.150
export const JOIST_CC       = 0.600   // c/c 600 mm
export const POST_CC        = 1.800   // max c/c 1800 mm between posts
export const MAX_JOIST_SPAN = 2.000   // max 2 m between beam supports

// Evenly distributed positions (≤ cc spacing) from x0 to x1, always includes both ends
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

// All beam Y positions (parallel to wall), spaced so no joist span exceeds MAX_JOIST_SPAN.
// Index 0 = ledger (at wall), last = outer beam.
// When shape is provided, also inserts a beam at every horizontal edge (L/U-shape steps)
// so the corner of the narrower section is always supported.
export function getBeamYPositions(minY: number, maxY: number, shape?: Point[]): number[] {
  const n = Math.max(1, Math.ceil((maxY - minY) / MAX_JOIST_SPAN))
  const evenly = Array.from({ length: n + 1 }, (_, i) => minY + (i / n) * (maxY - minY))

  if (!shape) return evenly

  const ε = 0.001
  const stepYs: number[] = []
  const len = shape.length
  for (let i = 0; i < len; i++) {
    const a = shape[i], b = shape[(i + 1) % len]
    if (Math.abs(a.y - b.y) < ε) {
      const y = (a.y + b.y) / 2
      if (y > minY + ε && y < maxY - ε) stepYs.push(y)
    }
  }

  if (stepYs.length === 0) return evenly

  const all = [...evenly, ...stepYs].sort((a, b) => a - b)
  return all.filter((y, i) => i === 0 || Math.abs(y - all[i - 1]) > ε)
}

// X extent of the deck polygon at a given Y scanline (for clipping beams to shape).
// Uses a small inset (ε) so boundary beams resolve correctly.
export function getShapeXExtentAtY(
  shape: Point[],
  y: number,
): { minX: number; maxX: number } | null {
  const xs: number[] = []
  const n = shape.length
  for (let i = 0; i < n; i++) {
    const a = shape[i], b = shape[(i + 1) % n]
    if ((a.y < y && b.y >= y) || (b.y < y && a.y >= y)) {
      xs.push(a.x + ((y - a.y) / (b.y - a.y)) * (b.x - a.x))
    }
  }
  return xs.length >= 2 ? { minX: Math.min(...xs), maxX: Math.max(...xs) } : null
}

// Safe helper: insets Y slightly so beams at the exact shape boundary resolve
export function beamXExtent(
  shape: Point[],
  y: number,
  minY: number,
  maxY: number,
  fallbackMinX: number,
  fallbackMaxX: number,
): { minX: number; maxX: number } {
  const ε = 0.001
  const sampleY = y <= minY ? minY + ε : y >= maxY ? maxY - ε : y
  return getShapeXExtentAtY(shape, sampleY) ?? { minX: fallbackMinX, maxX: fallbackMaxX }
}

// Y extent of the deck polygon at a given X scanline (for clipping joists to shape)
export function getShapeYExtentAtX(
  shape: Point[],
  x: number,
): { minY: number; maxY: number } | null {
  const ys: number[] = []
  const n = shape.length
  for (let i = 0; i < n; i++) {
    const a = shape[i], b = shape[(i + 1) % n]
    if ((a.x < x && b.x >= x) || (b.x < x && a.x >= x)) {
      ys.push(a.y + ((x - a.x) / (b.x - a.x)) * (b.y - a.y))
    }
  }
  return ys.length >= 2 ? { minY: Math.min(...ys), maxY: Math.max(...ys) } : null
}

// Safe helper: insets X slightly so joists at the exact shape boundary resolve.
// Returns null if the X position is outside the shape (joist should be skipped).
export function joistYExtent(
  shape: Point[],
  x: number,
  minX: number,
  maxX: number,
): { minY: number; maxY: number } | null {
  const ε = 0.001
  const sampleX = x <= minX ? minX + ε : x >= maxX ? maxX - ε : x
  return getShapeYExtentAtX(shape, sampleX)
}

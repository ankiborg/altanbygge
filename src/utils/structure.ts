import type { Point } from '@/types/deck'

export const BOARD_W        = 0.120   // 120 mm face width
export const BOARD_T        = 0.028   // 28 mm thickness
export const BOARD_GAP      = 0.002   // 2 mm gap between boards
export const BOARD_OVERHANG = 0.015   // 15 mm overhang past deck edge
export const BOARD_CC       = BOARD_W + BOARD_GAP  // 122 mm c/c
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
export const MAX_CANTILEVER = MAX_JOIST_SPAN / 4  // max 500 mm overhang past last beam

export const UTERUM_POST_W  = 0.060   // 60 mm aluminiumprofil
export const UTERUM_FRAME_H = 0.060   // 60 mm toppram
export const UTERUM_GLASS_T = 0.008   // 8 mm glasskiva

export const PERGOLA_POST_W      = 0.090  // 90×90 mm post
export const PERGOLA_BEAM_W      = 0.045  // 45 mm beam width (thin dimension)
export const PERGOLA_BEAM_H      = 0.145  // 145 mm beam height
export const PERGOLA_RAFTER_W    = 0.045  // 45 mm rafter width
export const PERGOLA_RAFTER_H    = 0.095  // 95 mm rafter height
export const PERGOLA_RAFTER_OV   = 0.200  // 200 mm rafter overhang past beam
export const PERGOLA_POST_BASE_W = 0.100  // post shoe footprint
export const PERGOLA_POST_BASE_H = 0.050  // post shoe height

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
// When shape is provided, inserts mandatory beams at horizontal step edges (L/U-shapes).
// Uses an anchor-fill approach: step edges are anchors; gaps between anchors are filled
// with evenly-spaced intermediates. This prevents two beams landing close together when
// a step edge nearly coincides with an evenly-spaced position.
export function getBeamYPositions(minY: number, maxY: number, shape?: Point[]): number[] {
  const ε = 0.001

  const stepYs: number[] = []
  if (shape) {
    const len = shape.length
    for (let i = 0; i < len; i++) {
      const a = shape[i], b = shape[(i + 1) % len]
      if (Math.abs(a.y - b.y) < ε) {
        const y = (a.y + b.y) / 2
        if (y > minY + ε && y < maxY - ε) stepYs.push(y)
      }
    }
  }

  // Sorted, deduplicated anchors: ledger + step edges + outer beam
  const anchors = [minY, ...stepYs, maxY]
    .sort((a, b) => a - b)
    .filter((y, i, arr) => i === 0 || Math.abs(y - arr[i - 1]) > ε)

  // Fill each gap with evenly-spaced intermediates (never near an anchor boundary)
  const result: number[] = [anchors[0]]
  for (let i = 1; i < anchors.length; i++) {
    const a = anchors[i - 1], b = anchors[i]
    const n = Math.ceil((b - a) / MAX_JOIST_SPAN)
    for (let j = 1; j <= n; j++) {
      result.push(a + (j / n) * (b - a))
    }
  }

  return result
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

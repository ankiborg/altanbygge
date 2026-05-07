import type { Point, DeckShape, BoardDirection } from '@/types/deck'
import { BOARD_W, BOARD_GAP, BOARD_OVERHANG } from './structure'

// Resize edge i to newLength by translating the downstream (or upstream) non-wall
// vertices so that orthogonal shapes stay orthogonal.
export function resizeEdge(shape: DeckShape, edgeIndex: number, newLength: number): DeckShape {
  const n = shape.length
  const from = shape[edgeIndex]
  const to   = shape[(edgeIndex + 1) % n]
  const dx = to.x - from.x, dy = to.y - from.y
  const oldLen = Math.sqrt(dx * dx + dy * dy)
  if (oldLen < 0.001 || newLength < 0.1) return shape

  const delta   = newLength - oldLen
  const dir     = { x: dx / oldLen, y: dy / oldLen }
  const moveVec = { x: dir.x * delta, y: dir.y * delta }
  const ε       = 0.001

  const next = shape.map(p => ({ ...p }))

  if (to.y < ε && from.y >= ε) {
    // Edge ends at the wall → move `from` away from wall and propagate upstream
    const back = { x: -moveVec.x, y: -moveVec.y }
    let i = edgeIndex
    while (true) {
      if (next[i].y >= ε) {
        next[i] = { x: next[i].x + back.x, y: next[i].y + back.y }
      } else break
      const prev = (i - 1 + n) % n
      if (prev === (edgeIndex + 1) % n) break
      i = prev
    }
  } else {
    // Normal: move `to` and propagate downstream, stop at wall
    let i = (edgeIndex + 1) % n
    while (i !== edgeIndex) {
      if (next[i].y >= ε) {
        next[i] = { x: next[i].x + moveVec.x, y: next[i].y + moveVec.y }
      } else break
      i = (i + 1) % n
    }
  }

  return next
}

export function snapToGrid(p: Point, gridSize: number): Point {
  return {
    x: Math.round(p.x / gridSize) * gridSize,
    y: Math.round(p.y / gridSize) * gridSize,
  }
}

// ---------------------------------------------------------------------------
// Board lines – works for any polygon via scanline intersection
// ---------------------------------------------------------------------------

export type BoardLine = { a: Point; b: Point; width: number }

export function getBoardLinesForShape(
  shape: DeckShape,
  boardDirection: BoardDirection,
): BoardLine[] {
  const CC = BOARD_W + BOARD_GAP
  const OV = BOARD_OVERHANG
  const result: BoardLine[] = []
  const n = shape.length
  if (n < 3) return result

  const xs = shape.map(p => p.x)
  const ys = shape.map(p => p.y)
  const minX = Math.min(...xs), maxX = Math.max(...xs)
  const minY = Math.min(...ys), maxY = Math.max(...ys)

  // Intersect the polygon with a horizontal (dir='y') or vertical (dir='x') line at `pos`.
  // Returns sorted hit values in the perpendicular axis.
  function polyHits(dir: 'x' | 'y', pos: number): number[] {
    const hits: number[] = []
    for (let i = 0; i < n; i++) {
      const p1 = shape[i], p2 = shape[(i + 1) % n]
      const v1 = dir === 'y' ? p1.y : p1.x
      const v2 = dir === 'y' ? p2.y : p2.x
      const u1 = dir === 'y' ? p1.x : p1.y
      const u2 = dir === 'y' ? p2.x : p2.y
      if ((v1 <= pos && v2 > pos) || (v2 <= pos && v1 > pos))
        hits.push(u1 + (u2 - u1) * (pos - v1) / (v2 - v1))
    }
    return hits.sort((a, b) => a - b)
  }

  // Place boards along `crossAxis` from `edgeMin` to `edgeMax`, each running in `runAxis`.
  // Boards start OV past edgeMin (or flush at wall for parallel), end OV past edgeMax.
  // The last board may be narrower than BOARD_W to land exactly OV past edgeMax.
  const sweep = (crossAxis: 'x' | 'y', edgeMin: number, edgeMax: number) => {
    const endTarget = edgeMax + OV  // outer edge of last board
    // Parallel boards (crossAxis='y') start flush at wall (minY), no wall-side overhang
    const startEdge = crossAxis === 'y' ? edgeMin : edgeMin - OV
    for (let k = 0; ; k++) {
      const innerEdge = startEdge + k * CC
      if (innerEdge >= endTarget) break
      const bw = Math.min(BOARD_W, endTarget - innerEdge)
      if (bw < 0.005) break
      const center = innerEdge + bw / 2
      const hits = polyHits(crossAxis, center)
      for (let i = 0; i + 1 < hits.length; i += 2) {
        // Perpendicular boards (crossAxis='x'): don't overhang past wall (minY)
        const loHit = hits[i]
        const lo = (crossAxis === 'x' && loHit <= minY + 0.001) ? loHit : loHit - OV
        const hi = hits[i + 1] + OV
        if (crossAxis === 'x')
          result.push({ a: { x: center, y: lo }, b: { x: center, y: hi }, width: bw })
        else
          result.push({ a: { x: lo, y: center }, b: { x: hi, y: center }, width: bw })
      }
    }
  }

  if (boardDirection === 'parallel') {
    sweep('y', minY, maxY)
  } else {
    sweep('x', minX, maxX)
  }

  return result
}

// ---------------------------------------------------------------------------
// Self-intersection check
// ---------------------------------------------------------------------------

function cross2d(o: Point, a: Point, b: Point): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)
}

function segmentsIntersect(a1: Point, a2: Point, b1: Point, b2: Point): boolean {
  const d1 = cross2d(b1, b2, a1)
  const d2 = cross2d(b1, b2, a2)
  const d3 = cross2d(a1, a2, b1)
  const d4 = cross2d(a1, a2, b2)
  return d1 * d2 < 0 && d3 * d4 < 0
}

export function hasIntersectingEdges(pts: Point[]): boolean {
  const n = pts.length
  for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue  // adjacent wrap-around
      if (segmentsIntersect(pts[i], pts[(i + 1) % n], pts[j], pts[(j + 1) % n])) {
        return true
      }
    }
  }
  return false
}

// ---------------------------------------------------------------------------
// Edge dimension data – outward-facing normal for each edge
// ---------------------------------------------------------------------------

export interface EdgeDim {
  from: Point
  to: Point
  mid: Point
  length: number
  outNormal: Point
}

export function getEdgeDims(shape: DeckShape): EdgeDim[] {
  const n = shape.length
  // Shoelace signed area: positive = CW in screen-space (Y-down)
  let area = 0
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    area += shape[i].x * shape[j].y - shape[j].x * shape[i].y
  }
  const cwSign = area > 0 ? 1 : -1

  return shape.map((p, i) => {
    const q = shape[(i + 1) % n]
    const dx = q.x - p.x
    const dy = q.y - p.y
    const len = Math.sqrt(dx * dx + dy * dy)
    return {
      from: p,
      to: q,
      mid: { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 },
      length: len,
      // Right-perpendicular of (dx, dy) for CW polygon = (dy, -dx) normalized
      outNormal: len > 0 ? { x: cwSign * dy / len, y: -cwSign * dx / len } : { x: 0, y: 0 },
    }
  })
}

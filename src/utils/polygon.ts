import type { Point, DeckShape, BoardDirection } from '@/types/deck'

export function snapToGrid(p: Point, gridSize: number): Point {
  return {
    x: Math.round(p.x / gridSize) * gridSize,
    y: Math.round(p.y / gridSize) * gridSize,
  }
}

// ---------------------------------------------------------------------------
// Board lines – works for any polygon via scanline intersection
// ---------------------------------------------------------------------------

export function getBoardLinesForShape(
  shape: DeckShape,
  boardDirection: BoardDirection,
  spacingM = 0.145,
): [Point, Point][] {
  const lines: [Point, Point][] = []
  const n = shape.length
  if (n < 3) return lines

  const xs = shape.map(p => p.x)
  const ys = shape.map(p => p.y)
  const minX = Math.min(...xs), maxX = Math.max(...xs)
  const minY = Math.min(...ys), maxY = Math.max(...ys)

  if (boardDirection === 'parallel') {
    for (let y = minY + spacingM; y < maxY; y += spacingM) {
      const hits: number[] = []
      for (let i = 0; i < n; i++) {
        const p1 = shape[i], p2 = shape[(i + 1) % n]
        if ((p1.y <= y && p2.y > y) || (p2.y <= y && p1.y > y)) {
          hits.push(p1.x + (p2.x - p1.x) * (y - p1.y) / (p2.y - p1.y))
        }
      }
      hits.sort((a, b) => a - b)
      for (let i = 0; i + 1 < hits.length; i += 2) {
        lines.push([{ x: hits[i], y }, { x: hits[i + 1], y }])
      }
    }
  } else {
    for (let x = minX + spacingM; x < maxX; x += spacingM) {
      const hits: number[] = []
      for (let i = 0; i < n; i++) {
        const p1 = shape[i], p2 = shape[(i + 1) % n]
        if ((p1.x <= x && p2.x > x) || (p2.x <= x && p1.x > x)) {
          hits.push(p1.y + (p2.y - p1.y) * (x - p1.x) / (p2.x - p1.x))
        }
      }
      hits.sort((a, b) => a - b)
      for (let i = 0; i + 1 < hits.length; i += 2) {
        lines.push([{ x, y: hits[i] }, { x, y: hits[i + 1] }])
      }
    }
  }

  return lines
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

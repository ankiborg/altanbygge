import type { Point, DeckShape, Stair, PlanterBox } from '@/types/deck'
import type { EdgeDim } from './polygon'

export const STEP_RISE = 0.17   // metres per step
export const STEP_DEPTH = 0.28  // tread depth in metres

export function numSteps(heightAboveGround: number): number {
  return Math.max(1, Math.ceil(heightAboveGround / STEP_RISE))
}

export function isWallEdge(edge: EdgeDim): boolean {
  // Wall edge: outward normal points towards the house (negative Y)
  return edge.outNormal.y < -0.5
}

// Unit tangent along the edge (from → to)
function edgeTangent(edge: EdgeDim): Point {
  const dx = edge.to.x - edge.from.x
  const dy = edge.to.y - edge.from.y
  const len = Math.sqrt(dx * dx + dy * dy)
  return len > 0 ? { x: dx / len, y: dy / len } : { x: 1, y: 0 }
}

// Centre point of stair/planter along the edge
function objectCenter(edge: EdgeDim, offset: number): Point {
  const t = edgeTangent(edge)
  return { x: edge.mid.x + offset * t.x, y: edge.mid.y + offset * t.y }
}

// Four corners of the stair footprint in world coordinates
// Extends outward (away from deck) by numSteps * STEP_DEPTH
export function getStairCorners(
  edge: EdgeDim,
  stair: Stair,
  steps: number,
): [Point, Point, Point, Point] {
  const t = edgeTangent(edge)
  const n = edge.outNormal
  const c = objectCenter(edge, stair.offset)
  const hw = stair.width / 2
  const reach = steps * STEP_DEPTH

  const innerLeft  = { x: c.x - hw * t.x,              y: c.y - hw * t.y }
  const innerRight = { x: c.x + hw * t.x,              y: c.y + hw * t.y }
  const outerRight = { x: innerRight.x + reach * n.x,  y: innerRight.y + reach * n.y }
  const outerLeft  = { x: innerLeft.x  + reach * n.x,  y: innerLeft.y  + reach * n.y }
  return [innerLeft, innerRight, outerRight, outerLeft]
}

// Tread lines from the inner edge outward, one per step
export function getStairTreadLines(
  edge: EdgeDim,
  stair: Stair,
  steps: number,
): [Point, Point][] {
  const t = edgeTangent(edge)
  const n = edge.outNormal
  const c = objectCenter(edge, stair.offset)
  const hw = stair.width / 2
  const lines: [Point, Point][] = []

  for (let s = 1; s <= steps; s++) {
    const dist = s * STEP_DEPTH
    const left  = { x: c.x - hw * t.x + dist * n.x, y: c.y - hw * t.y + dist * n.y }
    const right = { x: c.x + hw * t.x + dist * n.x, y: c.y + hw * t.y + dist * n.y }
    lines.push([left, right])
  }
  return lines
}

// Label position for a stair (just outside the outer edge, centred)
export function getStairLabelPos(edge: EdgeDim, stair: Stair, steps: number): Point {
  const n = edge.outNormal
  const c = objectCenter(edge, stair.offset)
  const reach = steps * STEP_DEPTH + 0.15
  return { x: c.x + reach * n.x, y: c.y + reach * n.y }
}

// ---------------------------------------------------------------------------
// Corner stair helpers
// ---------------------------------------------------------------------------

// Bisector of outward normals of the two edges meeting at cornerIndex
export function getCornerBisector(edges: EdgeDim[], cornerIndex: number, n: number): Point {
  // Edge cornerIndex runs FROM shape[cornerIndex]; the incoming edge is (cornerIndex-1+n)%n
  const prev = edges[(cornerIndex - 1 + n) % n]
  const curr = edges[cornerIndex]
  const nx = prev.outNormal.x + curr.outNormal.x
  const ny = prev.outNormal.y + curr.outNormal.y
  const len = Math.sqrt(nx * nx + ny * ny)
  return len > 0.01 ? { x: nx / len, y: ny / len } : curr.outNormal
}

export function getCornerStairCorners(
  shape: DeckShape,
  edges: EdgeDim[],
  stair: Stair,
  steps: number,
): [Point, Point, Point, Point] {
  const n = shape.length
  const anchor = shape[stair.cornerIndex]
  const nA = edges[(stair.cornerIndex - 1 + n) % n].outNormal
  const nB = edges[stair.cornerIndex].outNormal
  const d = steps * STEP_DEPTH

  return [
    anchor,
    { x: anchor.x + d * nA.x,             y: anchor.y + d * nA.y },
    { x: anchor.x + d * nA.x + d * nB.x,  y: anchor.y + d * nA.y + d * nB.y },
    { x: anchor.x + d * nB.x,             y: anchor.y + d * nB.y },
  ]
}

export function getCornerStairTreadLines(
  shape: DeckShape,
  edges: EdgeDim[],
  stair: Stair,
  steps: number,
): [Point, Point][] {
  const n = shape.length
  const anchor = shape[stair.cornerIndex]
  const nA = edges[(stair.cornerIndex - 1 + n) % n].outNormal
  const nB = edges[stair.cornerIndex].outNormal
  const lines: [Point, Point][] = []

  for (let s = 1; s <= steps; s++) {
    const d = s * STEP_DEPTH
    const pA  = { x: anchor.x + d * nA.x,             y: anchor.y + d * nA.y }
    const pAB = { x: anchor.x + d * nA.x + d * nB.x,  y: anchor.y + d * nA.y + d * nB.y }
    const pB  = { x: anchor.x + d * nB.x,             y: anchor.y + d * nB.y }
    lines.push([pA, pAB])
    lines.push([pAB, pB])
  }
  return lines
}

export function getCornerStairLabelPos(
  shape: DeckShape,
  edges: EdgeDim[],
  stair: Stair,
  steps: number,
): Point {
  const n = shape.length
  const anchor = shape[stair.cornerIndex]
  const nA = edges[(stair.cornerIndex - 1 + n) % n].outNormal
  const nB = edges[stair.cornerIndex].outNormal
  const d = steps * STEP_DEPTH
  return {
    x: anchor.x + (d * nA.x + d * nB.x) / 2,
    y: anchor.y + (d * nA.y + d * nB.y) / 2,
  }
}

// Returns true if a corner is valid for a corner stair:
//   • neither adjacent edge is the wall edge
//   • corner is convex (outward-facing) — cross(nA,nB) > 0
//   • corner is approximately right-angle — |dot(nA,nB)| < 0.35  (~±20° of 90°)
export function isValidCornerForStair(edges: EdgeDim[], cornerIndex: number, n: number): boolean {
  const prev = edges[(cornerIndex - 1 + n) % n]
  const curr = edges[cornerIndex]
  if (isWallEdge(prev) || isWallEdge(curr)) return false
  const nA = prev.outNormal, nB = curr.outNormal
  const cross = nA.x * nB.y - nA.y * nB.x   // > 0 for convex (outward) corner
  const dot   = nA.x * nB.x + nA.y * nB.y   // ≈ 0 for right-angle
  return cross > 0.1 && Math.abs(dot) < 0.35
}

// ---------------------------------------------------------------------------
// Four corners of the planter footprint in world coordinates
// Extends outward (away from deck) by boxDepth, same direction as stairs
export function getPlanterCorners(
  edge: EdgeDim,
  planter: PlanterBox,
): [Point, Point, Point, Point] {
  const t = edgeTangent(edge)
  const n = edge.outNormal  // outward, same as stairs
  const c = objectCenter(edge, planter.offset)
  const hw = planter.width / 2

  const edgeLeft   = { x: c.x - hw * t.x,                        y: c.y - hw * t.y }
  const edgeRight  = { x: c.x + hw * t.x,                        y: c.y + hw * t.y }
  const outerRight = { x: edgeRight.x + planter.boxDepth * n.x,  y: edgeRight.y + planter.boxDepth * n.y }
  const outerLeft  = { x: edgeLeft.x  + planter.boxDepth * n.x,  y: edgeLeft.y  + planter.boxDepth * n.y }
  return [edgeLeft, edgeRight, outerRight, outerLeft]
}

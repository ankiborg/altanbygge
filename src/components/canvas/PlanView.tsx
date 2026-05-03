import { useEffect, useRef } from 'react'
import { useDeckStore } from '@/store/deckStore'
import { getDeckCorners, toCanvas } from '@/utils/geometry'
import { getBoardLinesForShape, getEdgeDims, snapToGrid } from '@/utils/polygon'
import {
  isWallEdge, numSteps,
  getStairCorners, getStairTreadLines, getStairLabelPos,
  getCornerStairCorners, getCornerStairTreadLines, getCornerStairLabelPos,
  isValidCornerForStair,
  getPlanterCorners,
} from '@/utils/stairPlanter'
import { getPostXPositions, POST_W } from '@/utils/structure'
import type { DeckConfig, DeckShape, Point, Stair, PlanterBox } from '@/types/deck'

// ---------------------------------------------------------------------------
// Layout constants
// ---------------------------------------------------------------------------
const PAD = 40
const DIM = 36
const GRID = 0.25
const SNAP_CLOSE_PX = 14
const EDGE_HIT_PX = 20
const CORNER_HIT_PX = 18

type HoverTarget = { kind: 'edge'; index: number } | { kind: 'corner'; index: number } | null

// ---------------------------------------------------------------------------
// Drawing helpers
// ---------------------------------------------------------------------------

function drawDim(
  ctx: CanvasRenderingContext2D,
  x1: number, y1: number,
  x2: number, y2: number,
  label: string,
) {
  const ARROW = 7
  const angle = Math.atan2(y2 - y1, x2 - x1)
  const isHoriz = Math.abs(x2 - x1) >= Math.abs(y2 - y1)

  ctx.beginPath()
  ctx.moveTo(x1, y1)
  ctx.lineTo(x2, y2)
  ctx.stroke()

  for (const [px, py, sign] of [[x1, y1, 1], [x2, y2, -1]] as [number, number, number][]) {
    ctx.beginPath()
    ctx.moveTo(px, py)
    ctx.lineTo(px + sign * ARROW * Math.cos(angle - Math.PI / 6), py + sign * ARROW * Math.sin(angle - Math.PI / 6))
    ctx.moveTo(px, py)
    ctx.lineTo(px + sign * ARROW * Math.cos(angle + Math.PI / 6), py + sign * ARROW * Math.sin(angle + Math.PI / 6))
    ctx.stroke()
  }

  const mx = (x1 + x2) / 2
  const my = (y1 + y2) / 2
  const lx = isHoriz ? mx : mx + 16
  const ly = isHoriz ? my - 12 : my

  const m = ctx.measureText(label)
  ctx.fillStyle = '#f8f8f8'
  ctx.fillRect(lx - m.width / 2 - 2, ly - 7, m.width + 4, 14)
  ctx.fillStyle = '#333'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(label, lx, ly)
}

function drawExtLine(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number) {
  ctx.save()
  ctx.strokeStyle = '#bbb'
  ctx.lineWidth = 0.75
  ctx.setLineDash([3, 3])
  ctx.beginPath()
  ctx.moveTo(x1, y1)
  ctx.lineTo(x2, y2)
  ctx.stroke()
  ctx.restore()
}

function drawGrid(
  ctx: CanvasRenderingContext2D,
  W: number, H: number,
  scale: number,
  origin: Point,
  wallLength: number,
) {
  const step = GRID * scale
  if (step < 4) return

  ctx.save()
  ctx.strokeStyle = '#dde8f0'
  ctx.lineWidth = 0.5

  const xMin = -wallLength / 2 - 2
  const xMax =  wallLength / 2 + 2
  for (let wx = Math.ceil(xMin / GRID) * GRID; wx <= xMax; wx += GRID) {
    const cx = toCanvas({ x: wx, y: 0 }, scale, origin).x
    ctx.beginPath()
    ctx.moveTo(cx, 0)
    ctx.lineTo(cx, H)
    ctx.stroke()
  }

  const maxDepth = (H - origin.y) / scale + 1
  for (let wy = 0; wy <= maxDepth; wy += GRID) {
    const cy = toCanvas({ x: 0, y: wy }, scale, origin).y
    ctx.beginPath()
    ctx.moveTo(0, cy)
    ctx.lineTo(W, cy)
    ctx.stroke()
  }

  ctx.restore()
}

function drawSegmentLabel(
  ctx: CanvasRenderingContext2D,
  x1: number, y1: number,
  x2: number, y2: number,
  lengthM: number,
) {
  const dx = x2 - x1, dy = y2 - y1
  const canvasLen = Math.sqrt(dx * dx + dy * dy)
  if (canvasLen < 28) return

  const mx = (x1 + x2) / 2
  const my = (y1 + y2) / 2
  const nx = dy / canvasLen
  const ny = -dx / canvasLen
  const OFFSET = 16
  const lx = mx + nx * OFFSET
  const ly = my + ny * OFFSET

  const label = `${lengthM.toFixed(2)} m`
  ctx.save()
  ctx.font = 'bold 11px sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const tw = ctx.measureText(label).width
  const pad = 3, bh = 14
  const bx = lx - tw / 2 - pad
  const by = ly - bh / 2

  ctx.beginPath()
  ctx.moveTo(bx + 3, by)
  ctx.arcTo(bx + tw + pad * 2, by, bx + tw + pad * 2, by + bh, 3)
  ctx.arcTo(bx + tw + pad * 2, by + bh, bx, by + bh, 3)
  ctx.arcTo(bx, by + bh, bx, by, 3)
  ctx.arcTo(bx, by, bx + tw + pad * 2, by, 3)
  ctx.closePath()
  ctx.fillStyle = 'rgba(255,255,255,0.92)'
  ctx.fill()
  ctx.strokeStyle = 'rgba(0,0,0,0.15)'
  ctx.lineWidth = 0.5
  ctx.stroke()

  ctx.fillStyle = '#1e293b'
  ctx.fillText(label, lx, ly)
  ctx.restore()
}

// ---------------------------------------------------------------------------
// Geometry helpers for hit testing
// ---------------------------------------------------------------------------

function distToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay
  const lenSq = dx * dx + dy * dy
  if (lenSq === 0) return Math.sqrt((px - ax) ** 2 + (py - ay) ** 2)
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq))
  return Math.sqrt((px - ax - t * dx) ** 2 + (py - ay - t * dy) ** 2)
}

function pointInQuad(px: number, py: number, corners: [Point, Point, Point, Point], scale: number, origin: Point): boolean {
  const cs = corners.map(c => toCanvas(c, scale, origin))
  // Works for both CW and CCW: all cross products must share the same sign
  let sign = 0
  for (let i = 0; i < 4; i++) {
    const a = cs[i], b = cs[(i + 1) % 4]
    const cross = (b.x - a.x) * (py - a.y) - (b.y - a.y) * (px - a.x)
    if (cross !== 0) {
      const s = cross > 0 ? 1 : -1
      if (sign === 0) sign = s
      else if (s !== sign) return false
    }
  }
  return true
}

// ---------------------------------------------------------------------------
// Stair and planter rendering
// ---------------------------------------------------------------------------

function drawStair(
  ctx: CanvasRenderingContext2D,
  stair: Stair,
  shape: DeckShape,
  heightAboveGround: number,
  scale: number,
  origin: Point,
  selected: boolean,
) {
  const edges = getEdgeDims(shape)
  const steps = numSteps(heightAboveGround)

  let corners: [Point, Point, Point, Point]
  let treadLines: [Point, Point][]
  let labelPos: Point

  if (stair.kind === 'corner') {
    if (stair.cornerIndex < 0 || stair.cornerIndex >= shape.length) return
    corners  = getCornerStairCorners(shape, edges, stair, steps)
    treadLines = getCornerStairTreadLines(shape, edges, stair, steps)
    labelPos = getCornerStairLabelPos(shape, edges, stair, steps)
  } else {
    const edge = edges[stair.edgeIndex]
    if (!edge) return
    corners  = getStairCorners(edge, stair, steps)
    treadLines = getStairTreadLines(edge, stair, steps)
    labelPos = getStairLabelPos(edge, stair, steps)
  }

  const cs = corners.map(c => toCanvas(c, scale, origin))

  ctx.beginPath()
  cs.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y))
  ctx.closePath()
  ctx.fillStyle = 'rgba(245, 222, 179, 0.6)'
  ctx.fill()
  ctx.strokeStyle = selected ? '#2563eb' : '#8b6914'
  ctx.lineWidth = selected ? 2 : 1.5
  ctx.stroke()

  ctx.strokeStyle = '#c8a46e'
  ctx.lineWidth = 1
  for (const [a, b] of treadLines) {
    const ca = toCanvas(a, scale, origin)
    const cb = toCanvas(b, scale, origin)
    ctx.beginPath()
    ctx.moveTo(ca.x, ca.y)
    ctx.lineTo(cb.x, cb.y)
    ctx.stroke()
  }

  const cl = toCanvas(labelPos, scale, origin)
  const label = `${steps} steg`
  ctx.save()
  ctx.font = 'bold 11px sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const tw = ctx.measureText(label).width
  ctx.fillStyle = 'rgba(255,255,255,0.88)'
  ctx.fillRect(cl.x - tw / 2 - 3, cl.y - 8, tw + 6, 16)
  ctx.fillStyle = selected ? '#2563eb' : '#444'
  ctx.fillText(label, cl.x, cl.y)
  ctx.restore()
}

function drawPlanter(
  ctx: CanvasRenderingContext2D,
  planter: PlanterBox,
  shape: DeckShape,
  scale: number,
  origin: Point,
  selected: boolean,
) {
  const edges = getEdgeDims(shape)
  const edge = edges[planter.edgeIndex]
  if (!edge) return
  const corners = getPlanterCorners(edge, planter)
  const cs = corners.map(c => toCanvas(c, scale, origin))

  ctx.beginPath()
  cs.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y))
  ctx.closePath()
  ctx.fillStyle = 'rgba(139, 105, 20, 0.35)'
  ctx.fill()
  ctx.strokeStyle = selected ? '#2563eb' : '#5a4010'
  ctx.lineWidth = selected ? 2 : 1.5
  ctx.stroke()

  // Hatch pattern to distinguish from deck
  ctx.save()
  ctx.clip()
  ctx.strokeStyle = 'rgba(90, 64, 16, 0.25)'
  ctx.lineWidth = 1
  const minX = Math.min(...cs.map(c => c.x)) - 5
  const maxX = Math.max(...cs.map(c => c.x)) + 5
  const minY = Math.min(...cs.map(c => c.y)) - 5
  const maxY = Math.max(...cs.map(c => c.y)) + 5
  for (let d = minX + minY; d < maxX + maxY; d += 8) {
    ctx.beginPath()
    ctx.moveTo(d - minY, minY)
    ctx.lineTo(minX, d - minX)
    ctx.stroke()
  }
  ctx.restore()
}

// ---------------------------------------------------------------------------
// Main draw function
// ---------------------------------------------------------------------------

interface ViewState { scale: number; origin: Point }

interface DrawExtras {
  stairs: Stair[]
  planters: PlanterBox[]
  heightAboveGround: number
  hoverTarget: HoverTarget
  placingStair: boolean
  placingPlanter: boolean
  selectedStairId: string | null
  selectedPlanterId: string | null
  showStructure: boolean
}

function drawPlan(
  canvas: HTMLCanvasElement,
  cfg: DeckConfig,
  shape: DeckShape,
  drawingPts: DeckShape,
  isDrawingMode: boolean,
  cursor: Point | null,
  viewRef: React.MutableRefObject<ViewState>,
  extras: DrawExtras,
) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const { width: W, height: H } = canvas

  ctx.clearRect(0, 0, W, H)
  ctx.fillStyle = '#f8f8f8'
  ctx.fillRect(0, 0, W, H)

  const drawnPts = drawingPts.length > 0 ? drawingPts : shape
  const allX = drawnPts.map(p => p.x)
  const allY = drawnPts.map(p => p.y)
  const worldW = Math.max(cfg.wallLength, ...allX.map(Math.abs)) * 2 + 1
  const worldH = Math.max(cfg.deckDepth, ...(allY.length ? allY : [0]), isDrawingMode ? 5 : 0) + 1

  const scale = Math.min(
    (W - 2 * PAD - DIM) / worldW,
    (H - 2 * PAD - 2 * DIM) / worldH,
  )
  const origin: Point = { x: W / 2, y: PAD + DIM }
  viewRef.current = { scale, origin }

  if (isDrawingMode) {
    drawGrid(ctx, W, H, scale, origin, cfg.wallLength)
  }

  // --- Deck shape ---
  if (shape.length >= 3 && !isDrawingMode) {
    const canvasPts = shape.map(p => toCanvas(p, scale, origin))
    ctx.save()
    ctx.beginPath()
    canvasPts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y))
    ctx.closePath()
    ctx.fillStyle = '#f5deb3'
    ctx.fill()
    ctx.clip()

    ctx.strokeStyle = '#c8a46e'
    ctx.lineWidth = 1
    for (const [a, b] of getBoardLinesForShape(shape, cfg.boardDirection)) {
      const ca = toCanvas(a, scale, origin)
      const cb = toCanvas(b, scale, origin)
      ctx.beginPath()
      ctx.moveTo(ca.x, ca.y)
      ctx.lineTo(cb.x, cb.y)
      ctx.stroke()
    }
    ctx.restore()

    ctx.strokeStyle = '#8b6914'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    canvasPts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y))
    ctx.closePath()
    ctx.stroke()
  }

  // --- Edge / corner hover highlight (placing mode) ---
  if (!isDrawingMode && shape.length >= 3 && (extras.placingStair || extras.placingPlanter)) {
    const edges = getEdgeDims(shape)

    // Wall-edge red tint (stair placement only)
    if (extras.placingStair) {
      edges.forEach((edge) => {
        if (isWallEdge(edge)) {
          const cf = toCanvas(edge.from, scale, origin)
          const ct = toCanvas(edge.to, scale, origin)
          ctx.save()
          ctx.strokeStyle = 'rgba(239,68,68,0.5)'
          ctx.lineWidth = 4
          ctx.beginPath()
          ctx.moveTo(cf.x, cf.y)
          ctx.lineTo(ct.x, ct.y)
          ctx.stroke()
          ctx.restore()
        }
      })
    }

    const ht = extras.hoverTarget
    if (ht?.kind === 'edge') {
      const edge = edges[ht.index]
      if (edge) {
        const cf = toCanvas(edge.from, scale, origin)
        const ct = toCanvas(edge.to, scale, origin)
        ctx.save()
        ctx.strokeStyle = '#f59e0b'
        ctx.lineWidth = 5
        ctx.beginPath()
        ctx.moveTo(cf.x, cf.y)
        ctx.lineTo(ct.x, ct.y)
        ctx.stroke()
        ctx.restore()
      }
    } else if (ht?.kind === 'corner') {
      const cp = toCanvas(shape[ht.index], scale, origin)
      ctx.save()
      ctx.strokeStyle = '#f59e0b'
      ctx.lineWidth = 2.5
      ctx.beginPath()
      ctx.arc(cp.x, cp.y, 10, 0, Math.PI * 2)
      ctx.stroke()
      ctx.fillStyle = 'rgba(245,158,11,0.25)'
      ctx.fill()
      ctx.restore()
    }
  }

  // --- Planters ---
  if (!isDrawingMode) {
    for (const pl of extras.planters) {
      drawPlanter(ctx, pl, shape, scale, origin, pl.id === extras.selectedPlanterId)
    }
  }

  // --- Post positions (structure mode) ---
  if (!isDrawingMode && extras.showStructure && shape.length >= 3) {
    const sxs = shape.map(p => p.x), sys = shape.map(p => p.y)
    const minX = Math.min(...sxs), maxX = Math.max(...sxs)
    const maxY = Math.max(...sys)
    const halfW = (POST_W / 2) * scale
    ctx.save()
    ctx.fillStyle = '#5a4010'
    ctx.strokeStyle = '#3a2800'
    ctx.lineWidth = 1
    for (const px of getPostXPositions(minX, maxX)) {
      const cp = toCanvas({ x: px, y: maxY }, scale, origin)
      ctx.beginPath()
      ctx.rect(cp.x - halfW, cp.y - halfW, halfW * 2, halfW * 2)
      ctx.fill()
      ctx.stroke()
    }
    ctx.restore()
  }

  // --- Stairs ---
  if (!isDrawingMode) {
    for (const st of extras.stairs) {
      drawStair(ctx, st, shape, extras.heightAboveGround, scale, origin, st.id === extras.selectedStairId)
    }
  }

  // --- House wall ---
  const wl = toCanvas({ x: -cfg.wallLength / 2, y: 0 }, scale, origin)
  const wr = toCanvas({ x:  cfg.wallLength / 2, y: 0 }, scale, origin)
  ctx.strokeStyle = '#444'
  ctx.lineWidth = 6
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(wl.x, wl.y)
  ctx.lineTo(wr.x, wr.y)
  ctx.stroke()
  ctx.lineCap = 'butt'

  ctx.fillStyle = '#444'
  ctx.font = '10px sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'bottom'
  ctx.fillText('HUSVÄGG', (wl.x + wr.x) / 2, wl.y - 6)

  // --- Dimension lines ---
  ctx.strokeStyle = '#666'
  ctx.lineWidth = 1
  ctx.font = '11px sans-serif'

  if (!isDrawingMode) {
    const DIM_OFFSET = 28

    if (shape.length >= 3) {
      for (const { from, to, length, outNormal } of getEdgeDims(shape)) {
        if (length < 0.05) continue
        const cf = toCanvas(from, scale, origin)
        const ct = toCanvas(to, scale, origin)
        const d1x = cf.x + outNormal.x * DIM_OFFSET
        const d1y = cf.y + outNormal.y * DIM_OFFSET
        const d2x = ct.x + outNormal.x * DIM_OFFSET
        const d2y = ct.y + outNormal.y * DIM_OFFSET
        drawExtLine(ctx, cf.x, cf.y, d1x, d1y)
        drawExtLine(ctx, ct.x, ct.y, d2x, d2y)
        drawDim(ctx, d1x, d1y, d2x, d2y, `${length.toFixed(2)} m`)
      }
    }

    const dimY1 = PAD + DIM / 2
    drawExtLine(ctx, wl.x, wl.y, wl.x, dimY1)
    drawExtLine(ctx, wr.x, wr.y, wr.x, dimY1)
    drawDim(ctx, wl.x, dimY1, wr.x, dimY1, `${cfg.wallLength.toFixed(1)} m`)
  }

  // --- In-progress drawing ---
  if (isDrawingMode && drawingPts.length > 0) {
    const cPts = drawingPts.map(p => toCanvas(p, scale, origin))
    const first = cPts[0]
    const last = cPts[cPts.length - 1]

    if (cPts.length >= 3) {
      ctx.save()
      ctx.beginPath()
      cPts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y))
      if (cursor) {
        const cc = toCanvas(cursor, scale, origin)
        ctx.lineTo(cc.x, cc.y)
      }
      ctx.closePath()
      ctx.fillStyle = 'rgba(200, 164, 110, 0.18)'
      ctx.fill()
      ctx.restore()
    }

    ctx.strokeStyle = '#8b6914'
    ctx.lineWidth = 2
    ctx.beginPath()
    cPts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y))
    ctx.stroke()

    for (let i = 1; i < drawingPts.length; i++) {
      const a = drawingPts[i - 1], b = drawingPts[i]
      const ca = cPts[i - 1], cb = cPts[i]
      const lengthM = Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2)
      drawSegmentLabel(ctx, ca.x, ca.y, cb.x, cb.y, lengthM)
    }

    cPts.forEach((p, i) => {
      ctx.beginPath()
      ctx.arc(p.x, p.y, i === 0 ? 6 : 4, 0, Math.PI * 2)
      ctx.fillStyle = i === 0 ? '#2563eb' : '#8b6914'
      ctx.fill()
    })

    if (cursor) {
      const cc = toCanvas(cursor, scale, origin)
      const dx = cc.x - first.x, dy = cc.y - first.y
      const nearFirst = Math.sqrt(dx * dx + dy * dy) < SNAP_CLOSE_PX && drawingPts.length >= 3

      ctx.save()
      ctx.strokeStyle = nearFirst ? '#2563eb' : '#999'
      ctx.lineWidth = 1.5
      ctx.setLineDash([5, 4])
      ctx.beginPath()
      ctx.moveTo(last.x, last.y)
      ctx.lineTo(nearFirst ? first.x : cc.x, nearFirst ? first.y : cc.y)
      ctx.stroke()
      ctx.restore()

      const targetPt = nearFirst ? drawingPts[0] : cursor
      const lastPtWorld = drawingPts[drawingPts.length - 1]
      const previewLenM = Math.sqrt(
        (targetPt.x - lastPtWorld.x) ** 2 + (targetPt.y - lastPtWorld.y) ** 2,
      )
      const tx = nearFirst ? first.x : cc.x
      const ty = nearFirst ? first.y : cc.y
      drawSegmentLabel(ctx, last.x, last.y, tx, ty, previewLenM)

      if (!nearFirst && drawingPts.length >= 3) {
        ctx.save()
        ctx.strokeStyle = 'rgba(37,99,235,0.4)'
        ctx.lineWidth = 1
        ctx.setLineDash([4, 4])
        ctx.beginPath()
        ctx.moveTo(cc.x, cc.y)
        ctx.lineTo(first.x, first.y)
        ctx.stroke()
        ctx.restore()
      }

      ctx.beginPath()
      ctx.arc(cc.x, cc.y, 4, 0, Math.PI * 2)
      ctx.fillStyle = nearFirst ? '#2563eb' : '#444'
      ctx.fill()

      if (nearFirst) {
        ctx.beginPath()
        ctx.arc(first.x, first.y, 10, 0, Math.PI * 2)
        ctx.strokeStyle = '#2563eb'
        ctx.lineWidth = 1.5
        ctx.stroke()
      }

      if (cursor.y === 0) {
        ctx.beginPath()
        ctx.arc(cc.x, cc.y, 8, 0, Math.PI * 2)
        ctx.strokeStyle = '#22c55e'
        ctx.lineWidth = 1.5
        ctx.stroke()
      }
    }

    const dimY1 = PAD + DIM / 2
    ctx.strokeStyle = '#666'
    ctx.lineWidth = 1
    ctx.font = '11px sans-serif'
    drawExtLine(ctx, wl.x, wl.y, wl.x, dimY1)
    drawExtLine(ctx, wr.x, wr.y, wr.x, dimY1)
    drawDim(ctx, wl.x, dimY1, wr.x, dimY1, `${cfg.wallLength.toFixed(1)} m`)
  }

  if (isDrawingMode) {
    ctx.save()
    ctx.font = '11px sans-serif'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    ctx.fillStyle = 'rgba(0,0,0,0.35)'
    ctx.fillText('Klicka för att placera hörn  ·  Klicka på startpunkt eller vägg för att stänga', PAD, PAD / 2 - 4)
    ctx.restore()
  }

  // Placing-mode instruction
  if (extras.placingStair || extras.placingPlanter) {
    ctx.save()
    ctx.font = '11px sans-serif'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    ctx.fillStyle = 'rgba(0,0,0,0.45)'
    ctx.fillText(
      extras.placingStair
        ? 'Klicka på en kant eller ett hörn (gul cirkel) för att placera trappan'
        : 'Klicka på en kant för att placera blomlådan',
      PAD, PAD / 2 - 4,
    )
    ctx.restore()
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function PlanView() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const viewRef = useRef<ViewState>({ scale: 1, origin: { x: 0, y: 0 } })
  const cursorRef = useRef<Point | null>(null)
  const hoverTargetRef = useRef<HoverTarget>(null)

  const {
    wallLength, wallDirection, deckWidth, deckDepth, heightAboveGround, boardDirection,
    customShape, drawingPoints, isDrawingMode,
    stairs, planters, placingStair, placingPlanter, selectedStairId, selectedPlanterId,
    showStructure,
    addDrawingPoint, finishDrawing,
    addStair, addPlanter, selectStair, selectPlanter, clearSelection,
  } = useDeckStore()

  const cfg: DeckConfig = { wallLength, wallDirection, deckWidth, deckDepth, heightAboveGround, boardDirection }
  const shape: DeckShape = customShape ?? getDeckCorners(cfg)

  const extras: DrawExtras = {
    stairs, planters, heightAboveGround,
    hoverTarget: hoverTargetRef.current,
    placingStair, placingPlanter,
    selectedStairId, selectedPlanterId,
    showStructure,
  }

  function redraw(cursor = cursorRef.current, hoverTarget = hoverTargetRef.current) {
    const canvas = canvasRef.current
    const parent = canvas?.parentElement
    if (!canvas || !parent) return
    if (canvas.width !== parent.clientWidth)  canvas.width  = parent.clientWidth
    if (canvas.height !== parent.clientHeight) canvas.height = parent.clientHeight
    const ex: DrawExtras = { ...extras, hoverTarget }
    drawPlan(canvas, cfg, shape, drawingPoints, isDrawingMode, cursor, viewRef, ex)
  }

  useEffect(() => {
    const canvas = canvasRef.current
    const parent = canvas?.parentElement
    if (!canvas || !parent) return

    canvas.width  = parent.clientWidth
    canvas.height = parent.clientHeight
    drawPlan(canvas, cfg, shape, drawingPoints, isDrawingMode, cursorRef.current, viewRef, extras)

    const ro = new ResizeObserver(() => redraw())
    ro.observe(parent)
    return () => ro.disconnect()
  }, [
    wallLength, wallDirection, deckWidth, deckDepth, heightAboveGround, boardDirection,
    customShape, drawingPoints, isDrawingMode,
    stairs, planters, placingStair, placingPlanter, selectedStairId, selectedPlanterId,
    showStructure,
  ])

  function worldFromEvent(e: React.MouseEvent<HTMLCanvasElement>): Point {
    const rect = canvasRef.current!.getBoundingClientRect()
    const { scale, origin } = viewRef.current
    return {
      x: (e.clientX - rect.left - origin.x) / scale,
      y: (e.clientY - rect.top  - origin.y) / scale,
    }
  }

  function snapPoint(raw: Point): Point {
    const snapped = snapToGrid(raw, GRID)
    if (snapped.y < GRID / 2) snapped.y = 0
    if (drawingPoints.length > 0) {
      const first = drawingPoints[0]
      const { scale, origin } = viewRef.current
      const cf = toCanvas(first, scale, origin)
      const cc = toCanvas(snapped, scale, origin)
      if (Math.sqrt((cc.x - cf.x) ** 2 + (cc.y - cf.y) ** 2) < SNAP_CLOSE_PX) {
        return { ...first }
      }
    }
    return snapped
  }

  function findHoverTarget(canvasX: number, canvasY: number): HoverTarget {
    const { scale, origin } = viewRef.current
    const edges = getEdgeDims(shape)
    const n = shape.length

    // Corners first (only for stair placement, and only valid corners)
    if (placingStair) {
      for (let i = 0; i < n; i++) {
        const cp = toCanvas(shape[i], scale, origin)
        const dist = Math.sqrt((canvasX - cp.x) ** 2 + (canvasY - cp.y) ** 2)
        if (dist < CORNER_HIT_PX && isValidCornerForStair(edges, i, n)) {
          return { kind: 'corner', index: i }
        }
      }
    }

    // Edges
    let best: HoverTarget = null
    let bestDist = EDGE_HIT_PX
    edges.forEach((edge, i) => {
      const cf = toCanvas(edge.from, scale, origin)
      const ct = toCanvas(edge.to, scale, origin)
      const d = distToSegment(canvasX, canvasY, cf.x, cf.y, ct.x, ct.y)
      if (d < bestDist) {
        bestDist = d
        best = { kind: 'edge', index: i }
      }
    })
    return best
  }

  function handleMouseMove(e: React.MouseEvent<HTMLCanvasElement>) {
    const rect = canvasRef.current!.getBoundingClientRect()
    const cx = e.clientX - rect.left
    const cy = e.clientY - rect.top

    if (isDrawingMode) {
      const pt = snapPoint(worldFromEvent(e))
      cursorRef.current = pt
      redraw(pt, null)
      return
    }

    if (placingStair || placingPlanter) {
      const target = findHoverTarget(cx, cy)
      hoverTargetRef.current = target
      redraw(null, target)
    }
  }

  function handleMouseLeave() {
    if (isDrawingMode) {
      cursorRef.current = null
      redraw(null, null)
    } else if (placingStair || placingPlanter) {
      hoverTargetRef.current = null
      redraw(null, null)
    }
  }

  function handleClick(e: React.MouseEvent<HTMLCanvasElement>) {
    // Drawing mode
    if (isDrawingMode) {
      const pt = snapPoint(worldFromEvent(e))

      if (drawingPoints.length >= 3) {
        const first = drawingPoints[0]
        const { scale, origin } = viewRef.current
        const cf = toCanvas(first, scale, origin)
        const cc = toCanvas(pt, scale, origin)
        if (Math.sqrt((cc.x - cf.x) ** 2 + (cc.y - cf.y) ** 2) < SNAP_CLOSE_PX) {
          finishDrawing()
          return
        }
        if (pt.y === 0 && drawingPoints.length >= 2) {
          addDrawingPoint(pt)
          finishDrawing()
          return
        }
      }
      addDrawingPoint(pt)
      return
    }

    // Placing stair
    if (placingStair) {
      const target = hoverTargetRef.current
      if (!target) return
      const edges = getEdgeDims(shape)
      const n = shape.length

      if (target.kind === 'corner') {
        if (!isValidCornerForStair(edges, target.index, n)) return
        const prevEdge = edges[(target.index - 1 + n) % n]
        const currEdge = edges[target.index]
        const avgLen = (prevEdge.length + currEdge.length) / 2
        addStair({
          id: crypto.randomUUID(),
          kind: 'corner',
          edgeIndex: -1,
          cornerIndex: target.index,
          offset: 0,
          width: Math.min(1.5, avgLen * 0.5),
        })
      } else {
        const edge = edges[target.index]
        if (!edge || isWallEdge(edge)) return
        addStair({
          id: crypto.randomUUID(),
          kind: 'edge',
          edgeIndex: target.index,
          cornerIndex: -1,
          offset: 0,
          width: Math.min(1.0, edge.length * 0.6),
        })
      }
      hoverTargetRef.current = null
      return
    }

    // Placing planter
    if (placingPlanter) {
      const target = hoverTargetRef.current
      if (!target || target.kind !== 'edge') return
      const edges = getEdgeDims(shape)
      const edge = edges[target.index]
      if (!edge) return
      addPlanter({
        id: crypto.randomUUID(),
        edgeIndex: target.index,
        offset: 0,
        width: Math.min(1.0, edge.length * 0.6),
        boxDepth: 0.35,
      })
      hoverTargetRef.current = null
      return
    }

    // Selection
    const rect = canvasRef.current!.getBoundingClientRect()
    const cx = e.clientX - rect.left
    const cy = e.clientY - rect.top
    const { scale, origin } = viewRef.current
    const edges = getEdgeDims(shape)

    for (const st of stairs) {
      const steps = numSteps(heightAboveGround)
      let corners: [Point, Point, Point, Point]
      if (st.kind === 'corner') {
        if (st.cornerIndex < 0 || st.cornerIndex >= shape.length) continue
        corners = getCornerStairCorners(shape, edges, st, steps)
      } else {
        const edge = edges[st.edgeIndex]
        if (!edge) continue
        corners = getStairCorners(edge, st, steps)
      }
      if (pointInQuad(cx, cy, corners, scale, origin)) {
        selectStair(st.id)
        return
      }
    }

    for (const pl of planters) {
      const edge = edges[pl.edgeIndex]
      if (!edge) continue
      const corners = getPlanterCorners(edge, pl)
      if (pointInQuad(cx, cy, corners, scale, origin)) {
        selectPlanter(pl.id)
        return
      }
    }

    clearSelection()
  }

  const activeCursor = isDrawingMode || placingStair || placingPlanter ? 'cursor-crosshair' : ''

  return (
    <div className={`w-full h-full bg-white ${activeCursor}`}>
      <canvas
        ref={canvasRef}
        style={{ display: 'block' }}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
      />
    </div>
  )
}

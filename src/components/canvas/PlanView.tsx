import { useEffect, useRef } from 'react'
import { useDeckStore } from '@/store/deckStore'
import { getDeckCorners, toCanvas } from '@/utils/geometry'
import { getBoardLinesForShape, getEdgeDims, snapToGrid } from '@/utils/polygon'
import type { DeckConfig, DeckShape, Point } from '@/types/deck'

// ---------------------------------------------------------------------------
// Layout constants
// ---------------------------------------------------------------------------
const PAD = 40    // canvas padding
const DIM = 36    // space per dimension annotation
const GRID = 0.25 // grid size in metres
const SNAP_CLOSE_PX = 14 // snap-to-first-point radius in canvas px

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

// ---------------------------------------------------------------------------
// Grid
// ---------------------------------------------------------------------------

function drawGrid(
  ctx: CanvasRenderingContext2D,
  W: number, H: number,
  scale: number,
  origin: Point,
  wallLength: number,
) {
  const step = GRID * scale
  if (step < 4) return  // too dense to draw

  ctx.save()
  ctx.strokeStyle = '#dde8f0'
  ctx.lineWidth = 0.5

  // vertical lines
  const xMin = -wallLength / 2 - 2
  const xMax =  wallLength / 2 + 2
  for (let wx = Math.ceil(xMin / GRID) * GRID; wx <= xMax; wx += GRID) {
    const cx = toCanvas({ x: wx, y: 0 }, scale, origin).x
    ctx.beginPath()
    ctx.moveTo(cx, 0)
    ctx.lineTo(cx, H)
    ctx.stroke()
  }

  // horizontal lines (from wall y=0 downward)
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

// ---------------------------------------------------------------------------
// Segment length label
// ---------------------------------------------------------------------------

function drawSegmentLabel(
  ctx: CanvasRenderingContext2D,
  x1: number, y1: number,
  x2: number, y2: number,
  lengthM: number,
) {
  const dx = x2 - x1, dy = y2 - y1
  const canvasLen = Math.sqrt(dx * dx + dy * dy)
  if (canvasLen < 28) return  // too short in pixels – skip

  const mx = (x1 + x2) / 2
  const my = (y1 + y2) / 2
  // Right-hand perpendicular (dy, -dx), normalised → label sits to the right of travel direction
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

  // Rounded white bubble
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
// Main draw function
// ---------------------------------------------------------------------------

interface ViewState { scale: number; origin: Point }

function drawPlan(
  canvas: HTMLCanvasElement,
  cfg: DeckConfig,
  shape: DeckShape,
  drawingPts: DeckShape,
  isDrawingMode: boolean,
  cursor: Point | null,
  viewRef: React.MutableRefObject<ViewState>,
) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const { width: W, height: H } = canvas

  ctx.clearRect(0, 0, W, H)
  ctx.fillStyle = '#f8f8f8'
  ctx.fillRect(0, 0, W, H)

  // --- Compute scale and origin ---
  // In drawing mode: show a stable area; otherwise fit to current shape/config
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

  // --- Grid (drawing mode only) ---
  if (isDrawingMode) {
    drawGrid(ctx, W, H, scale, origin, cfg.wallLength)
  }

  // --- Deck shape ---
  if (shape.length >= 3 && !isDrawingMode) {
    // Fill + board lines
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

    // Outline
    ctx.strokeStyle = '#8b6914'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    canvasPts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y))
    ctx.closePath()
    ctx.stroke()
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
    const DIM_OFFSET = 28  // px outward from edge

    if (shape.length >= 3) {
      // All polygon edges
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

    // Wall length annotation (always shown, above wall line)
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

    // Filled translucent preview
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

    // Placed edges + length labels
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

    // Placed points
    cPts.forEach((p, i) => {
      ctx.beginPath()
      ctx.arc(p.x, p.y, i === 0 ? 6 : 4, 0, Math.PI * 2)
      ctx.fillStyle = i === 0 ? '#2563eb' : '#8b6914'
      ctx.fill()
    })

    // Snap-to-first highlight
    if (cursor) {
      const cc = toCanvas(cursor, scale, origin)
      const dx = cc.x - first.x, dy = cc.y - first.y
      const nearFirst = Math.sqrt(dx * dx + dy * dy) < SNAP_CLOSE_PX && drawingPts.length >= 3

      // Dashed preview line to cursor
      ctx.save()
      ctx.strokeStyle = nearFirst ? '#2563eb' : '#999'
      ctx.lineWidth = 1.5
      ctx.setLineDash([5, 4])
      ctx.beginPath()
      ctx.moveTo(last.x, last.y)
      ctx.lineTo(nearFirst ? first.x : cc.x, nearFirst ? first.y : cc.y)
      ctx.stroke()
      ctx.restore()

      // Live segment length label on preview line
      const targetPt = nearFirst ? drawingPts[0] : cursor
      const lastPtWorld = drawingPts[drawingPts.length - 1]
      const previewLenM = Math.sqrt(
        (targetPt.x - lastPtWorld.x) ** 2 + (targetPt.y - lastPtWorld.y) ** 2,
      )
      const tx = nearFirst ? first.x : cc.x
      const ty = nearFirst ? first.y : cc.y
      drawSegmentLabel(ctx, last.x, last.y, tx, ty, previewLenM)

      // Dashed close-preview back to first (if not already near it)
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

      // Cursor dot
      ctx.beginPath()
      ctx.arc(cc.x, cc.y, 4, 0, Math.PI * 2)
      ctx.fillStyle = nearFirst ? '#2563eb' : '#444'
      ctx.fill()

      // Snap-to-first ring
      if (nearFirst) {
        ctx.beginPath()
        ctx.arc(first.x, first.y, 10, 0, Math.PI * 2)
        ctx.strokeStyle = '#2563eb'
        ctx.lineWidth = 1.5
        ctx.stroke()
      }

      // Snap-to-wall highlight
      if (cursor.y === 0) {
        ctx.beginPath()
        ctx.arc(cc.x, cc.y, 8, 0, Math.PI * 2)
        ctx.strokeStyle = '#22c55e'
        ctx.lineWidth = 1.5
        ctx.stroke()
      }
    }

    // Wall length annotation during drawing
    const dimY1 = PAD + DIM / 2
    ctx.strokeStyle = '#666'
    ctx.lineWidth = 1
    ctx.font = '11px sans-serif'
    drawExtLine(ctx, wl.x, wl.y, wl.x, dimY1)
    drawExtLine(ctx, wr.x, wr.y, wr.x, dimY1)
    drawDim(ctx, wl.x, dimY1, wr.x, dimY1, `${cfg.wallLength.toFixed(1)} m`)
  }

  // --- Drawing mode instruction ---
  if (isDrawingMode) {
    ctx.save()
    ctx.font = '11px sans-serif'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    ctx.fillStyle = 'rgba(0,0,0,0.35)'
    ctx.fillText('Klicka för att placera hörn  ·  Klicka på startpunkt eller vägg för att stänga', PAD, PAD / 2 - 4)
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

  const {
    wallLength, wallDirection, deckWidth, deckDepth, heightAboveGround, boardDirection,
    customShape, drawingPoints, isDrawingMode,
    addDrawingPoint, finishDrawing,
  } = useDeckStore()

  const cfg: DeckConfig = { wallLength, wallDirection, deckWidth, deckDepth, heightAboveGround, boardDirection }
  const shape: DeckShape = customShape ?? getDeckCorners(cfg)

  function redraw(cursor = cursorRef.current) {
    const canvas = canvasRef.current
    const parent = canvas?.parentElement
    if (!canvas || !parent) return
    if (canvas.width !== parent.clientWidth)  canvas.width  = parent.clientWidth
    if (canvas.height !== parent.clientHeight) canvas.height = parent.clientHeight
    drawPlan(canvas, cfg, shape, drawingPoints, isDrawingMode, cursor, viewRef)
  }

  useEffect(() => {
    const canvas = canvasRef.current
    const parent = canvas?.parentElement
    if (!canvas || !parent) return

    canvas.width  = parent.clientWidth
    canvas.height = parent.clientHeight
    drawPlan(canvas, cfg, shape, drawingPoints, isDrawingMode, cursorRef.current, viewRef)

    const ro = new ResizeObserver(() => redraw())
    ro.observe(parent)
    return () => ro.disconnect()
  }, [wallLength, wallDirection, deckWidth, deckDepth, heightAboveGround, boardDirection,
      customShape, drawingPoints, isDrawingMode])

  // --- Mouse helpers ---

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
    // Snap to wall
    if (snapped.y < GRID / 2) snapped.y = 0
    // Snap to first drawing point (in canvas space)
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

  function handleMouseMove(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!isDrawingMode) return
    const pt = snapPoint(worldFromEvent(e))
    cursorRef.current = pt
    redraw(pt)
  }

  function handleMouseLeave() {
    if (!isDrawingMode) return
    cursorRef.current = null
    redraw(null)
  }

  function handleClick(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!isDrawingMode) return
    const pt = snapPoint(worldFromEvent(e))

    // Snap to first point → close
    if (drawingPoints.length >= 3) {
      const first = drawingPoints[0]
      const { scale, origin } = viewRef.current
      const cf = toCanvas(first, scale, origin)
      const cc = toCanvas(pt, scale, origin)
      if (Math.sqrt((cc.x - cf.x) ** 2 + (cc.y - cf.y) ** 2) < SNAP_CLOSE_PX) {
        finishDrawing()
        return
      }
      // Click on wall → add wall point + close
      if (pt.y === 0 && drawingPoints.length >= 2) {
        addDrawingPoint(pt)
        finishDrawing()
        return
      }
    }

    addDrawingPoint(pt)
  }

  return (
    <div className={`w-full h-full bg-white ${isDrawingMode ? 'cursor-crosshair' : ''}`}>
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

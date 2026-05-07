import React, { useEffect, useMemo, useRef, type RefObject } from 'react'
import { useDeckStore } from '@/store/deckStore'
import { getDeckCorners } from '@/utils/geometry'
import { generateCutList, type KaplistItem, type PieceKind } from '@/utils/cutList'
import {
  BOARD_W, BOARD_T,
  JOIST_W, JOIST_H, BEAM_W, BEAM_H, POST_W, FOOTING_H,
} from '@/utils/structure'

// ── Principsnitt canvas ──────────────────────────────────────────────────────

function PrincipSnitt({ heightAboveGround }: { heightAboveGround: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const W = canvas.width, H = canvas.height
    ctx.clearRect(0, 0, W, H)

    const boardMm = BOARD_T * 1000      // 28
    const joistMm = JOIST_H * 1000     // 70
    const beamMm  = BEAM_H  * 1000     // 195
    const fMm     = FOOTING_H * 1000   // 150
    const postMm  = Math.max(10, heightAboveGround * 1000 - joistMm - beamMm - fMm)
    const totalMm = fMm + postMm + beamMm + joistMm + boardMm

    const mL = 56, mR = 44, mT = 10, mB = 18
    const drawH = H - mT - mB
    const scale  = drawH / totalMm

    // canvas y from world-mm (0=ground, up=positive)
    const cY = (wmm: number) => H - mB - wmm * scale
    const cX = mL + (W - mL - mR) / 2

    // draw a box centered at cX, width wPx (canvas px), height from yBot to yBot+hMm
    const box = (wPx: number, yBotMm: number, hMm: number, fill: string) => {
      const x = cX - wPx / 2
      const cy = cY(yBotMm + hMm)
      const ph = hMm * scale
      ctx.fillStyle = fill
      ctx.fillRect(x, cy, wPx, ph)
      ctx.strokeStyle = '#7a5010'
      ctx.lineWidth = 0.8
      ctx.strokeRect(x, cy, wPx, ph)
    }

    // Draw two label lines centered at canvas-y cy, 9px apart
    const lbl2 = (line1: string, line2: string, yMidMm: number) => {
      const cy = cY(yMidMm)
      ctx.fillStyle = '#4a4a4a'
      ctx.textAlign = 'right'
      ctx.fillText(line1, mL - 5, cy - 4.5)
      ctx.fillText(line2, mL - 5, cy + 4.5)
    }

    ctx.font = '8px system-ui, sans-serif'
    ctx.textBaseline = 'middle'

    // Ground dashed line
    ctx.strokeStyle = '#888'
    ctx.lineWidth = 1
    ctx.setLineDash([4, 3])
    ctx.beginPath(); ctx.moveTo(10, cY(0)); ctx.lineTo(W - mR + 10, cY(0)); ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = '#666'; ctx.textAlign = 'right'; ctx.fillText('Mark', mL - 5, cY(0))

    // Footing
    box(80, 0, fMm, '#b0b0b6')
    lbl2('Plint', `${FOOTING_W_MM}×${Math.round(fMm)}`, fMm / 2)

    // Post
    if (postMm >= 20) {
      box(30, fMm, postMm, '#c8902e')
      lbl2('Stolpe', `${POST_W * 1000|0}×${POST_W * 1000|0}`, fMm + postMm / 2)
    }

    // Beam
    const beamBase = fMm + postMm
    box(60, beamBase, beamMm, '#c8902e')
    lbl2('Balk', `${BEAM_W * 1000|0}×${beamMm|0}`, beamBase + beamMm / 2)

    // Joist
    const joistBase = beamBase + beamMm
    box(44, joistBase, joistMm, '#d09838')
    lbl2('Regel', `${JOIST_W * 1000|0}×${joistMm|0}`, joistBase + joistMm / 2)

    // Board
    const boardBase = joistBase + joistMm
    box(66, boardBase, boardMm, '#e0b258')
    lbl2('Trall', `${BOARD_W * 1000|0}×${boardMm|0}`, boardBase + boardMm / 2)

    // Dimension line: ground → top of boards
    const dimX = cX + 36
    const yTop = cY(totalMm), yBot = cY(0)
    ctx.strokeStyle = '#3366bb'; ctx.lineWidth = 0.9
    ctx.beginPath(); ctx.moveTo(dimX, yTop); ctx.lineTo(dimX, yBot); ctx.stroke()
    for (const y of [yTop, yBot]) {
      ctx.beginPath(); ctx.moveTo(dimX - 3, y); ctx.lineTo(dimX + 3, y); ctx.stroke()
    }
    ctx.fillStyle = '#3366bb'; ctx.textAlign = 'left'
    ctx.fillText(`${(heightAboveGround * 100).toFixed(0)} cm`, dimX + 5, (yTop + yBot) / 2)
  }, [heightAboveGround])

  return <canvas ref={canvasRef} width={190} height={240} className="max-w-full" />
}

const FOOTING_W_MM = 300
const KIND_ORDER: PieceKind[] = ['balk', 'stolpe', 'regel', 'trall', 'trappbräda', 'fasciabräda']
const KIND_LABEL: Record<PieceKind, string> = {
  balk:        'Balk',
  stolpe:      'Stolpe',
  regel:       'Regel',
  trall:       'Trall',
  trappbräda:  'Trappbrädor',
  fasciabräda: 'Sidoplankor',
}

// ── Kaplist table ────────────────────────────────────────────────────────────

function KaplistRow({
  item,
  selected,
  rowRef,
  onClick,
}: {
  item: KaplistItem
  selected: boolean
  rowRef?: RefObject<HTMLTableRowElement>
  onClick: () => void
}) {
  return (
    <tr
      ref={rowRef}
      onClick={onClick}
      className={`cursor-pointer border-b border-slate-100 transition-colors ${
        selected ? 'bg-blue-50' : 'hover:bg-slate-50'
      }`}
    >
      <td className={`pl-3 py-1.5 font-medium ${selected ? 'text-blue-700' : 'text-slate-600'}`}>
        {KIND_LABEL[item.kind] ?? item.kind}
      </td>
      <td className="px-2 py-1.5 text-slate-500 tabular-nums">
        {item.crossSection.w}×{item.crossSection.h}
      </td>
      <td className="px-2 py-1.5 text-slate-700 tabular-nums font-medium">
        {item.cutLength.toFixed(2)} m
      </td>
      <td className="px-2 py-1.5 text-slate-500 tabular-nums">
        {item.angle2 ? `${item.angle2}°` : '—'}
      </td>
      <td className="pr-3 py-1.5 text-slate-400 text-[10px] max-w-[120px] truncate">
        {item.note ?? ''}
      </td>
    </tr>
  )
}

// ── Main component ───────────────────────────────────────────────────────────

export default function DetailPanel() {
  const {
    wallLength, wallDirection, deckWidth, deckDepth,
    heightAboveGround, boardDirection, customShape,
    stairs, planters, pergolas, selectedPieceId, setSelectedPiece,
  } = useDeckStore()

  const shape = useMemo(
    () => customShape ?? getDeckCorners({ wallLength, wallDirection, deckWidth, deckDepth, heightAboveGround, boardDirection }),
    [customShape, wallLength, wallDirection, deckWidth, deckDepth, heightAboveGround, boardDirection],
  )

  const cfg = useMemo(
    () => ({ wallLength, wallDirection, deckWidth, deckDepth, heightAboveGround, boardDirection }),
    [wallLength, wallDirection, deckWidth, deckDepth, heightAboveGround, boardDirection],
  )

  const items = useMemo(
    () => generateCutList(shape, cfg, stairs, planters, pergolas),
    [shape, cfg, stairs, planters, pergolas],
  )

  const sorted = useMemo(
    () => [...items].sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind)),
    [items],
  )

  const selectedRowRef = useRef<HTMLTableRowElement>(null)

  useEffect(() => {
    if (selectedPieceId) {
      selectedRowRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  }, [selectedPieceId])

  // Group counts for header badges
  const counts = useMemo(() => {
    const map: Partial<Record<PieceKind, number>> = {}
    for (const item of sorted) map[item.kind] = (map[item.kind] ?? 0) + 1
    return map
  }, [sorted])

  // Build table rows with group headers interleaved
  const tableRows = useMemo(() => {
    const rows: React.ReactNode[] = []
    let prev: PieceKind | null = null
    for (const item of sorted) {
      if (item.kind !== prev) {
        prev = item.kind
        rows.push(
          <tr key={`grp-${item.kind}`} className="bg-slate-50">
            <td colSpan={5} className="pl-3 py-1 text-[10px] font-semibold text-slate-500 uppercase tracking-wide border-b border-slate-200">
              {KIND_LABEL[item.kind]} — {counts[item.kind]} st
            </td>
          </tr>,
        )
      }
      rows.push(
        <KaplistRow
          key={item.id}
          item={item}
          selected={item.id === selectedPieceId}
          rowRef={item.id === selectedPieceId ? selectedRowRef : undefined}
          onClick={() => setSelectedPiece(item.id === selectedPieceId ? null : item.id)}
        />,
      )
    }
    return rows
  }, [sorted, counts, selectedPieceId, setSelectedPiece])

  return (
    <div className="flex w-full h-full overflow-hidden">
      {/* Left: principsnitt */}
      <div className="w-52 shrink-0 border-r border-slate-200 flex flex-col">
        <div className="px-3 py-2 border-b border-slate-100">
          <span className="text-[11px] font-semibold text-slate-600 uppercase tracking-wide">
            Snitt A-A
          </span>
        </div>
        <div className="flex-1 flex items-start justify-center p-2 overflow-auto">
          <PrincipSnitt heightAboveGround={heightAboveGround} />
        </div>
      </div>

      {/* Right: kaplist */}
      <div className="flex-1 min-w-0 flex flex-col">
        <div className="px-3 py-2 border-b border-slate-100 flex items-center gap-3">
          <span className="text-[11px] font-semibold text-slate-600 uppercase tracking-wide">
            Kaplist
          </span>
          <span className="text-[10px] text-slate-400">{sorted.length} delar totalt</span>
          {selectedPieceId && (
            <button
              className="ml-auto text-[10px] text-blue-500 hover:text-blue-700"
              onClick={() => setSelectedPiece(null)}
            >
              Rensa markering
            </button>
          )}
        </div>
        <div className="flex-1 overflow-auto">
          <table className="w-full text-xs border-collapse">
            <thead className="sticky top-0 bg-white z-10">
              <tr className="border-b border-slate-200">
                <th className="pl-3 py-1.5 text-left font-medium text-slate-500 text-[10px] uppercase tracking-wide">Typ</th>
                <th className="px-2 py-1.5 text-left font-medium text-slate-500 text-[10px] uppercase tracking-wide">Dim (mm)</th>
                <th className="px-2 py-1.5 text-left font-medium text-slate-500 text-[10px] uppercase tracking-wide">Längd</th>
                <th className="px-2 py-1.5 text-left font-medium text-slate-500 text-[10px] uppercase tracking-wide">Vinkel</th>
                <th className="pr-3 py-1.5 text-left font-medium text-slate-500 text-[10px] uppercase tracking-wide">Not</th>
              </tr>
            </thead>
            <tbody>
              {tableRows}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

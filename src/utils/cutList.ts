import type { DeckConfig, DeckShape, Stair, PlanterBox, Pergola, Uterum } from '@/types/deck'
import { getBoardLinesForShape, getEdgeDims } from './polygon'

import {
  BOARD_W, BOARD_T, BOARD_CC,
  JOIST_W, JOIST_H, BEAM_W, BEAM_H, POST_W,
  MAX_CANTILEVER,
  PERGOLA_POST_W, PERGOLA_BEAM_W, PERGOLA_BEAM_H,
  PERGOLA_RAFTER_W, PERGOLA_RAFTER_H, PERGOLA_RAFTER_OV,
  UTERUM_POST_W, UTERUM_FRAME_H,
  getJoistXPositions, getPostXPositions, getBeamYPositions,
  beamXExtent, joistYExtent, spanPositions,
} from './structure'
import { numSteps, STEP_DEPTH } from './stairPlanter'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PieceKind = 'trall' | 'regel' | 'balk' | 'stolpe' | 'trappbräda' | 'fasciabräda'

export interface KaplistItem {
  id:           string
  kind:         PieceKind
  crossSection: { w: number; h: number }  // mm × mm
  cutLength:    number                     // metres
  angle1:       number                     // miter degrees, end 1  (0 = straight)
  angle2:       number                     // miter degrees, end 2
  note?:        string                     // free annotation (corner stair segments)
}

// ---------------------------------------------------------------------------
// Stable, predictable IDs shared with PerspectiveView mesh userData
// ---------------------------------------------------------------------------

export const pieceId = {
  beam:  (bi: number) => `beam-${bi}`,
  post:  (bi: number, pi: number) => `post-${bi}-${pi}`,
  joist: (ji: number) => `joist-${ji}`,
  board: (bdi: number) => `board-${bdi}`,
  stair: (si: number, step: number, row: number, arm?: 'A' | 'B') =>
    arm ? `stair-${si}-${step}-${row}${arm}` : `stair-${si}-${step}-${row}`,
  fascia: (ei: number, row: number) => `fascia-${ei}-${row}`,
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.sqrt((bx - ax) ** 2 + (by - ay) ** 2)
}

// Intersection of offset lines — same formula as in stairPlanter.ts cornerOuter
function cornerOuter(
  ax: number, ay: number,
  nAx: number, nAy: number,
  nBx: number, nBy: number,
  d: number,
): { x: number; y: number } {
  const det = nAy * nBx - nAx * nBy
  if (Math.abs(det) < 0.001) {
    return { x: ax + d * nAx + d * nBx, y: ay + d * nAy + d * nBy }
  }
  const t = d * (1 - (nAx * nBx + nAy * nBy)) / det
  return { x: ax + d * nAx + t * nAy, y: ay + d * nAy - t * nAx }
}

// Miter angle at the outer corner where two tread segments meet
function mitrAngle(
  ax: number, ay: number,   // pA (deck side, segment 1 start)
  ox: number, oy: number,   // pOut (outer corner)
  bx: number, by: number,   // pB (deck side, segment 2 end)
): number {
  const d1x = ox - ax, d1y = oy - ay
  const d2x = bx - ox, d2y = by - oy
  const d1l = Math.sqrt(d1x * d1x + d1y * d1y)
  const d2l = Math.sqrt(d2x * d2x + d2y * d2y)
  if (d1l < 0.001 || d2l < 0.001) return 45
  const dot = (d1x * d2x + d1y * d2y) / (d1l * d2l)
  const theta = Math.acos(Math.max(-1, Math.min(1, dot))) * 180 / Math.PI
  return Math.round((180 - theta) / 2 * 10) / 10
}

// ---------------------------------------------------------------------------
// Main generator
// ---------------------------------------------------------------------------

export function generateCutList(
  shape: DeckShape,
  cfg: DeckConfig,
  stairs: Stair[],
  _planters: PlanterBox[],
  pergolas: Pergola[] = [],
  uterums: Uterum[] = [],
): KaplistItem[] {
  const items: KaplistItem[] = []

  const xs = shape.map(p => p.x)
  const ys = shape.map(p => p.y)
  const minX = Math.min(...xs), maxX = Math.max(...xs)
  const minY = Math.min(...ys), maxY = Math.max(...ys)
  const ε = 0.001

  const beamYs  = getBeamYPositions(minY, maxY, shape)
  const { heightAboveGround } = cfg

  // ── Beams ────────────────────────────────────────────────────────────────
  for (let bi = 0; bi < beamYs.length; bi++) {
    const by  = beamYs[bi]
    const ext = beamXExtent(shape, by, minY, maxY, minX, maxX)
    items.push({
      id:           pieceId.beam(bi),
      kind:         'balk',
      crossSection: { w: BEAM_W * 1000, h: BEAM_H * 1000 },
      cutLength:    ext.maxX - ext.minX,
      angle1: 0, angle2: 0,
    })
  }

  // ── Posts ────────────────────────────────────────────────────────────────
  const FOOTING_H = 0.150
  const postH = Math.max(0, heightAboveGround - JOIST_H - BEAM_H - FOOTING_H)
  let postIdx = 0
  for (let bi = 1; bi < beamYs.length; bi++) {
    const by  = beamYs[bi]
    const ext = beamXExtent(shape, by, minY, maxY, minX, maxX)
    for (const _px of getPostXPositions(ext.minX, ext.maxX)) {
      if (postH > 0.01) {
        items.push({
          id:           pieceId.post(bi, postIdx),
          kind:         'stolpe',
          crossSection: { w: POST_W * 1000, h: POST_W * 1000 },
          cutLength:    postH,
          angle1: 0, angle2: 0,
        })
      }
      postIdx++
    }
  }

  // ── Joists ───────────────────────────────────────────────────────────────
  let ji = 0
  for (const jx of getJoistXPositions(minX, maxX)) {
    const ext = joistYExtent(shape, jx, minX, maxX)
    if (!ext) { ji++; continue }

    let outerBeamY = ext.minY
    for (let bi = beamYs.length - 1; bi >= 0; bi--) {
      const by   = beamYs[bi]
      if (by > ext.maxY + ε) continue
      const bext = beamXExtent(shape, by, minY, maxY, minX, maxX)
      if (bext.minX <= jx + ε && bext.maxX >= jx - ε) { outerBeamY = by; break }
    }

    const jMaxY = Math.min(ext.maxY, outerBeamY + MAX_CANTILEVER)
    if (jMaxY > ext.minY + ε) {
      items.push({
        id:           pieceId.joist(ji),
        kind:         'regel',
        crossSection: { w: JOIST_W * 1000, h: JOIST_H * 1000 },
        cutLength:    jMaxY - ext.minY,
        angle1: 0, angle2: 0,
      })
    }
    ji++
  }

  // ── Deck boards ──────────────────────────────────────────────────────────
  const boardLines = getBoardLinesForShape(shape, cfg.boardDirection)
  for (let bdi = 0; bdi < boardLines.length; bdi++) {
    const { a, b, width } = boardLines[bdi]
    const len = dist(a.x, a.y, b.x, b.y)
    if (len < 0.01) continue
    items.push({
      id:           pieceId.board(bdi),
      kind:         'trall',
      crossSection: { w: Math.round(width * 1000), h: BOARD_T * 1000 },
      cutLength:    len,
      angle1: 0, angle2: 0,
    })
  }

  // ── Stairs ───────────────────────────────────────────────────────────────
  const edges = getEdgeDims(shape)
  const steps = numSteps(heightAboveGround)

  for (let si = 0; si < stairs.length; si++) {
    const stair = stairs[si]

    if (stair.kind === 'corner') {
      const n      = shape.length
      const anchor = shape[stair.cornerIndex]
      if (!anchor) continue
      const nA = edges[(stair.cornerIndex - 1 + n) % n].outNormal
      const nB = edges[stair.cornerIndex].outNormal

      // 2 board rows per step, 2 arms (A+B) per row → 4 items per step
      for (let s = 0; s < steps; s++) {
        for (let r = 0; r < 2; r++) {
          const d   = s * STEP_DEPTH + BOARD_W / 2 + r * BOARD_CC
          const pAx = anchor.x + d * nA.x, pAy = anchor.y + d * nA.y
          const pO  = cornerOuter(anchor.x, anchor.y, nA.x, nA.y, nB.x, nB.y, d)
          const pBx = anchor.x + d * nB.x, pBy = anchor.y + d * nB.y

          const lenA  = dist(pAx, pAy, pO.x, pO.y)
          const lenB  = dist(pO.x, pO.y, pBx, pBy)
          const miter = mitrAngle(pAx, pAy, pO.x, pO.y, pBx, pBy)

          if (lenA > 0.01) {
            items.push({
              id:           pieceId.stair(si, s, r, 'A'),
              kind:         'trappbräda',
              crossSection: { w: BOARD_W * 1000, h: BOARD_T * 1000 },
              cutLength:    lenA,
              angle1:       0,
              angle2:       miter,
              note:         `Steg ${s + 1} rad ${r + 1} · Gevingssåg ${miter}°`,
            })
          }
          if (lenB > 0.01) {
            items.push({
              id:           pieceId.stair(si, s, r, 'B'),
              kind:         'trappbräda',
              crossSection: { w: BOARD_W * 1000, h: BOARD_T * 1000 },
              cutLength:    lenB,
              angle1:       0,
              angle2:       miter,
              note:         `Steg ${s + 1} rad ${r + 1} · Gevingssåg ${miter}°`,
            })
          }
        }
      }
    } else {
      // Edge stair: 2 identical tread boards per step
      for (let s = 0; s < steps; s++) {
        for (let r = 0; r < 2; r++) {
          items.push({
            id:           pieceId.stair(si, s, r),
            kind:         'trappbräda',
            crossSection: { w: BOARD_W * 1000, h: BOARD_T * 1000 },
            cutLength:    stair.width,
            angle1: 0, angle2: 0,
            note:   `Steg ${s + 1} rad ${r + 1}`,
          })
        }
      }
    }
  }

  // ── Fascia (sidoplankor) ─────────────────────────────────────────────────────
  const fasciaEdges = getEdgeDims(shape)
  for (let ei = 0; ei < fasciaEdges.length; ei++) {
    const edge = fasciaEdges[ei]
    if (edge.from.y < 0.01 && edge.to.y < 0.01) continue
    const numRows = Math.ceil(cfg.heightAboveGround / BOARD_W)
    for (let r = 0; r < numRows; r++) {
      items.push({
        id:           pieceId.fascia(ei, r),
        kind:         'fasciabräda',
        crossSection: { w: BOARD_W * 1000, h: BOARD_T * 1000 },
        cutLength:    edge.length,
        angle1: 0, angle2: 0,
      })
    }
  }

  // ── Pergolas ─────────────────────────────────────────────────────────────────
  for (let pi = 0; pi < pergolas.length; pi++) {
    const pg = pergolas[pi]
    const { width, depth, height, rafterCC } = pg
    const note = `Pergola ${pi + 1}`

    // 4 posts
    for (let i = 0; i < 4; i++) {
      items.push({
        id:           `pergola-${pi}-post-${i}`,
        kind:         'stolpe',
        crossSection: { w: PERGOLA_POST_W * 1000, h: PERGOLA_POST_W * 1000 },
        cutLength:    height,
        angle1: 0, angle2: 0,
        note,
      })
    }

    // 2 beams
    for (let bi = 0; bi < 2; bi++) {
      items.push({
        id:           `pergola-${pi}-beam-${bi}`,
        kind:         'balk',
        crossSection: { w: PERGOLA_BEAM_W * 1000, h: PERGOLA_BEAM_H * 1000 },
        cutLength:    width,
        angle1: 0, angle2: 0,
        note,
      })
    }

    // Rafters
    const rafterXs = spanPositions(0, width, rafterCC)
    const rafterLen = depth + 2 * PERGOLA_RAFTER_OV
    for (let ri = 0; ri < rafterXs.length; ri++) {
      items.push({
        id:           `pergola-${pi}-rafter-${ri}`,
        kind:         'regel',
        crossSection: { w: PERGOLA_RAFTER_W * 1000, h: PERGOLA_RAFTER_H * 1000 },
        cutLength:    rafterLen,
        angle1: 0, angle2: 0,
        note,
      })
    }
  }

  // ── Uterums ──────────────────────────────────────────────────────────────────
  for (let ui = 0; ui < uterums.length; ui++) {
    const ur = uterums[ui]
    const { width, depth, height } = ur
    const note = `Uterum ${ui + 1}`

    // 4 corner posts
    for (let i = 0; i < 4; i++) {
      items.push({
        id:           `uterum-${ui}-post-${i}`,
        kind:         'stolpe',
        crossSection: { w: UTERUM_POST_W * 1000, h: UTERUM_POST_W * 1000 },
        cutLength:    height,
        angle1: 0, angle2: 0,
        note,
      })
    }

    // 4 top frame beams (2 × width + 2 × depth)
    for (let i = 0; i < 2; i++) {
      items.push({
        id:           `uterum-${ui}-framew-${i}`,
        kind:         'balk',
        crossSection: { w: UTERUM_FRAME_H * 1000, h: UTERUM_FRAME_H * 1000 },
        cutLength:    width,
        angle1: 0, angle2: 0,
        note,
      })
      items.push({
        id:           `uterum-${ui}-framed-${i}`,
        kind:         'balk',
        crossSection: { w: UTERUM_FRAME_H * 1000, h: UTERUM_FRAME_H * 1000 },
        cutLength:    depth,
        angle1: 0, angle2: 0,
        note,
      })
    }
  }

  return items
}

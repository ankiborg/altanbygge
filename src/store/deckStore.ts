import { create } from 'zustand'
import type { DeckConfig, DeckShape, Point, WallDirection, BoardDirection, Stair, PlanterBox, Pergola } from '@/types/deck'
import { resizeEdge } from '@/utils/polygon'

interface DeckStore extends DeckConfig {
  setWallLength: (value: number) => void
  setWallDirection: (value: WallDirection) => void
  setDeckWidth: (value: number) => void
  setDeckDepth: (value: number) => void
  setHeightAboveGround: (value: number) => void
  setBoardDirection: (value: BoardDirection) => void

  customShape: DeckShape | null
  drawingPoints: DeckShape
  isDrawingMode: boolean

  startDrawing: () => void
  addDrawingPoint: (p: Point) => void
  undoDrawingPoint: () => void
  finishDrawing: () => void
  clearCustomShape: () => void
  setCustomShape: (shape: DeckShape) => void
  updateCustomShapeEdge: (edgeIndex: number, newLength: number) => void

  stairs: Stair[]
  planters: PlanterBox[]
  pergolas: Pergola[]
  placingStair: boolean
  placingPlanter: boolean
  placingPergola: boolean
  selectedStairId: string | null
  selectedPlanterId: string | null
  selectedPergolaId: string | null

  startPlacingStair: () => void
  startPlacingPlanter: () => void
  startPlacingPergola: () => void
  cancelPlacing: () => void

  addStair: (stair: Stair) => void
  updateStair: (id: string, updates: Partial<Omit<Stair, 'id'>>) => void
  deleteStair: (id: string) => void

  addPlanter: (planter: PlanterBox) => void
  updatePlanter: (id: string, updates: Partial<Omit<PlanterBox, 'id'>>) => void
  deletePlanter: (id: string) => void

  addPergola: (pergola: Pergola) => void
  updatePergola: (id: string, updates: Partial<Omit<Pergola, 'id'>>) => void
  deletePergola: (id: string) => void

  selectStair: (id: string) => void
  selectPlanter: (id: string) => void
  selectPergola: (id: string) => void
  clearSelection: () => void

  viewLayer: 1 | 2 | 3 | 4 | 5
  setViewLayer: (layer: 1 | 2 | 3 | 4 | 5) => void

  selectedPieceId: string | null
  setSelectedPiece: (id: string | null) => void
}

export const useDeckStore = create<DeckStore>()((set, get) => ({
  wallLength: 6,
  wallDirection: 'south',
  deckWidth: 6,
  deckDepth: 3,
  heightAboveGround: 0.6,
  boardDirection: 'perpendicular',

  setWallLength: (value) => set({ wallLength: value }),
  setWallDirection: (value) => set({ wallDirection: value }),
  setDeckWidth: (value) => set({ deckWidth: value }),
  setDeckDepth: (value) => set({ deckDepth: value }),
  setHeightAboveGround: (value) => set({ heightAboveGround: value }),
  setBoardDirection: (value) => set({ boardDirection: value }),

  customShape: null,
  drawingPoints: [],
  isDrawingMode: false,

  startDrawing: () => set({ isDrawingMode: true, drawingPoints: [] }),
  addDrawingPoint: (p) => set((s) => ({ drawingPoints: [...s.drawingPoints, p] })),
  undoDrawingPoint: () => set((s) => ({ drawingPoints: s.drawingPoints.slice(0, -1) })),
  finishDrawing: () => {
    const { drawingPoints } = get()
    if (drawingPoints.length < 3) return
    set({ customShape: drawingPoints, drawingPoints: [], isDrawingMode: false })
  },
  clearCustomShape: () =>
    set({ customShape: null, drawingPoints: [], isDrawingMode: false }),
  setCustomShape: (shape) => set({ customShape: shape }),
  updateCustomShapeEdge: (edgeIndex, newLength) => {
    const { customShape } = get()
    if (!customShape) return
    set({ customShape: resizeEdge(customShape, edgeIndex, newLength) })
  },

  stairs: [],
  planters: [],
  pergolas: [],
  placingStair: false,
  placingPlanter: false,
  placingPergola: false,
  selectedStairId: null,
  selectedPlanterId: null,
  selectedPergolaId: null,

  startPlacingStair:   () => set({ placingStair: true,   placingPlanter: false, placingPergola: false, selectedStairId: null, selectedPlanterId: null, selectedPergolaId: null }),
  startPlacingPlanter: () => set({ placingPlanter: true, placingStair: false,   placingPergola: false, selectedStairId: null, selectedPlanterId: null, selectedPergolaId: null }),
  startPlacingPergola: () => set({ placingPergola: true, placingStair: false,   placingPlanter: false, selectedStairId: null, selectedPlanterId: null, selectedPergolaId: null }),
  cancelPlacing: () => set({ placingStair: false, placingPlanter: false, placingPergola: false }),

  addStair: (stair) => set((s) => ({ stairs: [...s.stairs, stair], placingStair: false })),
  updateStair: (id, updates) =>
    set((s) => ({ stairs: s.stairs.map((st) => st.id === id ? { ...st, ...updates } : st) })),
  deleteStair: (id) =>
    set((s) => ({ stairs: s.stairs.filter((st) => st.id !== id), selectedStairId: null })),

  addPlanter: (planter) => set((s) => ({ planters: [...s.planters, planter], placingPlanter: false })),
  updatePlanter: (id, updates) =>
    set((s) => ({ planters: s.planters.map((pl) => pl.id === id ? { ...pl, ...updates } : pl) })),
  deletePlanter: (id) =>
    set((s) => ({ planters: s.planters.filter((pl) => pl.id !== id), selectedPlanterId: null })),

  addPergola: (pergola) => set((s) => ({ pergolas: [...s.pergolas, pergola], placingPergola: false })),
  updatePergola: (id, updates) =>
    set((s) => ({ pergolas: s.pergolas.map((pg) => pg.id === id ? { ...pg, ...updates } : pg) })),
  deletePergola: (id) =>
    set((s) => ({ pergolas: s.pergolas.filter((pg) => pg.id !== id), selectedPergolaId: null })),

  selectStair:   (id) => set({ selectedStairId: id,   selectedPlanterId: null, selectedPergolaId: null }),
  selectPlanter: (id) => set({ selectedPlanterId: id, selectedStairId: null,   selectedPergolaId: null }),
  selectPergola: (id) => set({ selectedPergolaId: id, selectedStairId: null,   selectedPlanterId: null }),
  clearSelection: () => set({ selectedStairId: null, selectedPlanterId: null, selectedPergolaId: null }),

  viewLayer: 4,
  setViewLayer: (layer) => set({ viewLayer: layer }),

  selectedPieceId: null,
  setSelectedPiece: (id) => set({ selectedPieceId: id }),
}))
